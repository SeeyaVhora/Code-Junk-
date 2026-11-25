import { prisma } from "../../lib/prisma.ts";
import { notFound } from "../../lib/errors.ts";
import { authedRouter, param } from "../../lib/route.ts";
import { refreshUserNotifications, sweepReminders } from "./service.ts";

export function notificationsRouter() {
  const r = authedRouter();

  r.get("/", async ({ userId }, req) => {
    await sweepReminders();
    await refreshUserNotifications(userId);
    const unreadOnly = req.query.unread === "true";
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { userId, kind: { not: "deleted" }, ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.notification.count({ where: { userId, kind: { not: "deleted" }, readAt: null } }),
    ]);
    return { items, unread };
  });

  r.patch("/:id/read", async ({ userId }, req) => {
    const res = await prisma.notification.updateMany({ where: { id: param(req, "id"), userId, readAt: null }, data: { readAt: new Date() } });
    if (res.count === 0 && !(await prisma.notification.findFirst({ where: { id: param(req, "id"), userId } }))) throw notFound("Notification not found.");
    return { ok: true };
  });

  r.post("/read-all", async ({ userId }) => {
    const res = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: res.count };
  });

  /**
   * Deleting a notification keeps a hidden tombstone row (same dedupe key, already read
   * and without content), so the sweep won't recreate it.
   */
  r.delete("/:id", async ({ userId }, req) => {
    const n = await prisma.notification.findFirst({ where: { id: param(req, "id"), userId } });
    if (!n) throw notFound("Notification not found.");
    if (n.dedupeKey) {
      await prisma.notification.update({ where: { id: n.id }, data: { kind: "deleted", title: "", body: null, link: null, readAt: n.readAt ?? new Date() } });
    } else {
      await prisma.notification.delete({ where: { id: n.id } });
    }
  });

  return r.router;
}
