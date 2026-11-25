import type { Request } from "express";
import { prisma } from "./prisma.ts";
import { notFound } from "./errors.ts";
import { authOf } from "../middleware/session.ts";
import { dateColumn, localDateKey } from "./time.ts";

/** The signed-in user's id plus the preferences most services need. */
export interface UserCtx {
  userId: string;
  tz: string;
  weekStartsOn: number;
}

export async function userCtx(req: Request): Promise<UserCtx> {
  const { userId } = authOf(req);
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { timeZone: true, weekStartsOn: true },
  });
  return { userId, tz: prefs?.timeZone ?? "UTC", weekStartsOn: prefs?.weekStartsOn ?? 1 };
}

type OwnedModel = "subject" | "topic" | "codeCollection" | "learningGoal" | "learningMilestone" | "uploadedDocument" | "learningSession";

/**
 * Confirms a referenced row exists and belongs to the user. Rows owned by someone else
 * produce the same 404 as missing rows, so ids can't be probed.
 */
export async function assertOwned(model: OwnedModel, userId: string, id: string | null | undefined, label = "Item") {
  if (!id) return;
  // Each delegate has findFirst with { where: { id, userId } }; typed loosely to share one helper.
  const delegate = prisma[model] as unknown as { findFirst(a: object): Promise<{ id: string } | null> };
  const row = await delegate.findFirst({ where: { id, userId }, select: { id: true } });
  if (!row) throw notFound(`${label} not found.`);
}

/** Topic must belong to the user *and* to the given subject. */
export async function assertTopicInSubject(userId: string, topicId: string | null | undefined, subjectId: string) {
  if (!topicId) return;
  const t = await prisma.topic.findFirst({ where: { id: topicId, userId, subjectId }, select: { id: true } });
  if (!t) throw notFound("Topic not found in this subject.");
}

/** Records an activity for streaks, "continue learning" and weekly consistency. */
export async function logActivity(
  ctx: UserCtx,
  kind: string,
  entity?: { type: string; id: string },
  meta?: Record<string, unknown>,
) {
  await prisma.activityLog.create({
    data: {
      userId: ctx.userId,
      kind,
      entityType: entity?.type,
      entityId: entity?.id,
      localDate: dateColumn(localDateKey(new Date(), ctx.tz)),
      meta: meta as object | undefined,
    },
  });
}

/** Cursor pagination: fetch limit+1, return the page and the next cursor. */
export function paginate<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

/** Upserts the user's tags by name and returns their ids. */
export async function resolveTags(userId: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const ids: string[] = [];
  for (const name of unique) {
    const tag = await prisma.tag.upsert({
      where: { userId_name: { userId, name } },
      update: {},
      create: { userId, name },
      select: { id: true },
    });
    ids.push(tag.id);
  }
  return ids;
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "item"
  );
}
