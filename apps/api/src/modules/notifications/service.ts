import { prisma } from "../../lib/prisma.ts";
import { logger } from "../../lib/logger.ts";
import { localDateKey, localDayRange, localWeekday } from "../../lib/time.ts";

/*
 * Notification generation. Every notification carries a dedupe key, and
 * (userId, dedupeKey) is unique, so running the sweep repeatedly never duplicates.
 *  - Reminders (sessions, events) fire from a background sweep every minute.
 *  - Derived notifications (exam soon, assignment due/overdue, revision due, missed
 *    sessions) are refreshed per user whenever they open the app.
 * The channel field is ready for email/push; only IN_APP is delivered today.
 */

async function add(userId: string, dedupeKey: string, n: { kind: string; title: string; body?: string; link?: string }) {
  try {
    await prisma.notification.create({ data: { userId, dedupeKey, ...n } });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e; // already exists
  }
}

const fmt = (d: Date, tz: string, allDay = false) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", ...(allDay ? {} : { hour: "2-digit", minute: "2-digit" }) }).format(d);

/** Fires all due reminders across users. */
export async function sweepReminders() {
  const due = await prisma.reminder.findMany({
    where: { fireAt: { lte: new Date() }, sentAt: null },
    take: 500,
    include: {
      user: { select: { preferences: { select: { timeZone: true, notifyInApp: true } } } },
      event: { select: { id: true, title: true, category: true, startsAt: true, allDay: true } },
      session: { select: { id: true, title: true, startsAt: true, status: true } },
    },
  });
  for (const r of due) {
    const tz = r.user.preferences?.timeZone ?? "UTC";
    const enabled = r.user.preferences?.notifyInApp !== false;
    if (enabled && r.event) {
      await add(r.userId, `reminder:${r.id}`, {
        kind: "reminder",
        title: `${r.event.category === "EXAMINATION" ? "Exam" : r.event.category === "ASSIGNMENT" ? "Assignment due" : "Upcoming"}: ${r.event.title}`,
        body: fmt(r.event.startsAt, tz, r.event.allDay),
        link: `/app/calendar?event=${r.event.id}`,
      });
    } else if (enabled && r.session && r.session.status === "SCHEDULED") {
      await add(r.userId, `reminder:${r.id}`, { kind: "session", title: `Study session: ${r.session.title}`, body: `Starts ${fmt(r.session.startsAt, tz)}`, link: `/app/planner/sessions/${r.session.id}` });
    }
    await prisma.reminder.update({ where: { id: r.id }, data: { sentAt: new Date() } });
  }
  return due.length;
}

/** Refreshes derived notifications for one user. Cheap enough to run on each dashboard load. */
export async function refreshUserNotifications(userId: string) {
  const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
  if (prefs && !prefs.notifyInApp) return;
  const tz = prefs?.timeZone ?? "UTC";
  const now = new Date();
  const today = localDateKey(now, tz);
  const DAY = 86_400_000;

  if (prefs?.notifyExams !== false) {
    const exams = await prisma.calendarEvent.findMany({
      where: { userId, category: "EXAMINATION", completedAt: null, startsAt: { gt: now, lt: new Date(now.getTime() + 3 * DAY) } },
      select: { id: true, title: true, startsAt: true, allDay: true },
    });
    for (const e of exams) {
      const within24 = e.startsAt.getTime() - now.getTime() < DAY;
      await add(userId, `exam-${within24 ? "1d" : "3d"}:${e.id}`, {
        kind: "exam",
        title: `${within24 ? "Exam tomorrow" : "Exam in 3 days"}: ${e.title}`,
        body: fmt(e.startsAt, tz, e.allDay),
        link: `/app/calendar?event=${e.id}`,
      });
    }
  }

  if (prefs?.notifyAssignments !== false) {
    const assignments = await prisma.calendarEvent.findMany({
      where: { userId, category: "ASSIGNMENT", startsAt: { lt: new Date(now.getTime() + DAY) }, assignment: { submissionStatus: { notIn: ["SUBMITTED", "GRADED", "COMPLETED"] } } },
      select: { id: true, title: true, startsAt: true },
    });
    for (const a of assignments) {
      const overdue = a.startsAt < now;
      await add(userId, `assignment-${overdue ? "overdue" : "24h"}:${a.id}`, {
        kind: overdue ? "overdue" : "assignment",
        title: overdue ? `Overdue: ${a.title}` : `Due within 24 hours: ${a.title}`,
        body: `Due ${fmt(a.startsAt, tz)}`,
        link: `/app/calendar?event=${a.id}`,
      });
    }
  }

  if (prefs?.notifyRevision !== false) {
    const { end } = localDayRange(now, tz);
    const due = await prisma.revisionItem.count({ where: { userId, status: { not: "SUSPENDED" }, nextReviewAt: { lt: end } } });
    const weekly = localWeekday(now, tz) === (prefs?.revisionDay ?? 0);
    if (weekly) {
      await add(userId, `weekly-revision:${today}`, { kind: "revision", title: "It's your weekly revision day", body: due ? `${due} question${due === 1 ? "" : "s"} are ready to revise.` : "Revisit your red and yellow questions.", link: "/app/revision" });
    } else if (due > 0) {
      await add(userId, `revision:${today}`, { kind: "revision", title: `${due} question${due === 1 ? "" : "s"} due for revision`, link: "/app/revision" });
    }
  }

  if (prefs?.notifySessions !== false) {
    // A scheduled session whose whole slot passed without being started.
    const missed = await prisma.learningSession.findMany({
      where: { userId, status: "SCHEDULED", startsAt: { gt: new Date(now.getTime() - 7 * DAY), lt: now } },
      select: { id: true, title: true, startsAt: true, plannedMins: true },
    });
    for (const s of missed.filter((s) => s.startsAt.getTime() + s.plannedMins * 60_000 < now.getTime())) {
      await add(userId, `session-missed:${s.id}`, { kind: "overdue", title: `Missed study session: ${s.title}`, body: "Reschedule it or mark it done if you studied anyway.", link: `/app/planner/sessions/${s.id}` });
    }
  }
}

let timer: NodeJS.Timeout | null = null;
export function startReminderSweep(intervalMs = 60_000) {
  if (timer) return;
  const run = () => sweepReminders().catch((e) => logger.error({ err: e }, "reminder sweep failed"));
  timer = setInterval(run, intervalMs);
  timer.unref();
  void run();
}
export function stopReminderSweep() {
  if (timer) clearInterval(timer);
  timer = null;
}
