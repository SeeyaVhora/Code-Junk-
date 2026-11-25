import { calendarRange, eventInput, eventPatch } from "@code-junk/shared";
import type { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/prisma.ts";
import { badRequest, notFound } from "../../lib/errors.ts";
import { assertOwned } from "../../lib/context.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { setReminders } from "../planner/service.ts";

const eventInclude = {
  subject: { select: { id: true, name: true } },
  goal: { select: { id: true, title: true } },
  examination: true,
  assignment: true,
  reminders: { where: { sentAt: null }, select: { offsetMins: true } },
} satisfies Prisma.CalendarEventInclude;
type EventRow = Prisma.CalendarEventGetPayload<{ include: typeof eventInclude }>;

const DONE = ["SUBMITTED", "GRADED", "COMPLETED"];
/** Assignment is overdue when its due time has passed and it isn't handed in. */
export function presentEvent(e: EventRow) {
  const overdue = !!e.assignment && !DONE.includes(e.assignment.submissionStatus) && e.startsAt.getTime() < Date.now();
  return { ...e, reminderMins: e.reminders.map((r) => r.offsetMins), overdue };
}

export function calendarRouter() {
  const r = authedRouter();

  /** Unified feed for a date range: calendar events plus learning sessions from the planner. */
  r.get("/", async ({ userId }, req) => {
    const { from, to } = calendarRange.parse(req.query);
    const start = new Date(from);
    const end = new Date(to);
    if (end <= start || end.getTime() - start.getTime() > 400 * 86_400_000) throw badRequest("Choose a range of at most about a year.");
    const [events, sessions] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: { userId, OR: [{ startsAt: { gte: start, lt: end } }, { endsAt: { gt: start }, startsAt: { lt: end } }] },
        orderBy: { startsAt: "asc" },
        include: eventInclude,
      }),
      prisma.learningSession.findMany({
        where: { userId, startsAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
        orderBy: { startsAt: "asc" },
        include: { subject: { select: { id: true, name: true } }, topic: { select: { name: true } }, goal: { select: { id: true, title: true } } },
      }),
    ]);
    return { events: events.map(presentEvent), sessions };
  });

  r.get("/:id", async ({ userId }, req) => {
    const e = await prisma.calendarEvent.findFirst({ where: { id: param(req, "id"), userId }, include: { ...eventInclude, assignment: { include: { attachment: { select: { id: true, originalName: true } } } } } });
    if (!e) throw notFound("Event not found.");
    return { event: presentEvent(e) };
  });

  r.post("/", async ({ userId }, req) => {
    const input = eventInput.parse(req.body);
    await assertOwned("subject", userId, input.subjectId, "Subject");
    await assertOwned("learningGoal", userId, input.goalId, "Goal");
    const startsAt = new Date(input.startsAt);
    const e = await prisma.calendarEvent.create({
      data: {
        userId,
        category: input.category,
        title: input.title,
        description: input.description,
        location: input.location,
        subjectId: input.subjectId ?? null,
        goalId: input.goalId ?? null,
        startsAt,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        allDay: input.allDay,
        examination:
          input.category === "EXAMINATION"
            ? { create: { venue: input.venue ?? input.location ?? null, syllabus: input.syllabus, preparationStatus: input.preparationStatus ?? "NOT_STARTED" } }
            : undefined,
        assignment:
          input.category === "ASSIGNMENT"
            ? { create: { assignedAt: input.assignedAt ? new Date(input.assignedAt) : null, submissionStatus: input.submissionStatus ?? "NOT_STARTED", priority: input.priority ?? "MEDIUM" } }
            : undefined,
      },
    });
    await setReminders(userId, { eventId: e.id }, startsAt, input.reminderMins);
    const full = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: e.id }, include: eventInclude });
    return { event: presentEvent(full) };
  });

  r.patch("/:id", async ({ userId }, req) => {
    const id = param(req, "id");
    const input = eventPatch.parse(req.body);
    const e = await prisma.calendarEvent.findFirst({ where: { id, userId }, include: { examination: true, assignment: true } });
    if (!e) throw notFound("Event not found.");
    await assertOwned("subject", userId, input.subjectId, "Subject");
    const startsAt = input.startsAt ? new Date(input.startsAt) : e.startsAt;
    const endsAt = input.endsAt === undefined ? e.endsAt : input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt < startsAt) throw badRequest("The end must be after the start.");
    const submitting = input.submissionStatus === "SUBMITTED" && e.assignment?.submissionStatus !== "SUBMITTED";
    await prisma.calendarEvent.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        location: input.location,
        subjectId: input.subjectId,
        startsAt,
        endsAt,
        allDay: input.allDay,
        ...(input.completed !== undefined ? { completedAt: input.completed ? (e.completedAt ?? new Date()) : null } : {}),
        ...(e.examination && (input.venue !== undefined || input.syllabus !== undefined || input.preparationStatus)
          ? { examination: { update: { venue: input.venue, syllabus: input.syllabus, preparationStatus: input.preparationStatus } } }
          : {}),
        ...(e.assignment && (input.submissionStatus || input.priority || input.assignedAt !== undefined)
          ? {
              assignment: {
                update: {
                  submissionStatus: input.submissionStatus,
                  priority: input.priority,
                  assignedAt: input.assignedAt === undefined ? undefined : input.assignedAt ? new Date(input.assignedAt) : null,
                  ...(submitting ? { submittedAt: new Date() } : input.submissionStatus && !DONE.includes(input.submissionStatus) ? { submittedAt: null } : {}),
                },
              },
            }
          : {}),
      },
    });
    if (input.reminderMins) await setReminders(userId, { eventId: id }, startsAt, input.reminderMins);
    else if (input.startsAt) {
      const offsets = (await prisma.reminder.findMany({ where: { eventId: id, sentAt: null }, select: { offsetMins: true } })).map((x) => x.offsetMins);
      await setReminders(userId, { eventId: id }, startsAt, offsets);
    }
    // A submitted or finished item needs no more reminders.
    if (submitting || input.completed) await prisma.reminder.deleteMany({ where: { eventId: id, sentAt: null } });
    const full = await prisma.calendarEvent.findUniqueOrThrow({ where: { id }, include: eventInclude });
    return { event: presentEvent(full) };
  });

  r.delete("/:id", async ({ userId }, req) => {
    const e = await prisma.calendarEvent.findFirst({ where: { id: param(req, "id"), userId } });
    if (!e) throw notFound("Event not found.");
    if (e.category === "LEARNING_DEADLINE" && e.goalId) {
      // Keep goal and calendar consistent: removing the deadline clears the goal's target date.
      await prisma.learningGoal.update({ where: { id: e.goalId }, data: { targetDate: null } });
    }
    await prisma.calendarEvent.delete({ where: { id: e.id } });
  });

  return r.router;
}
