import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { Button, Menu, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";
import { cn } from "@/lib/cn";

interface Notif {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export const notificationsKey = ["notifications"] as const;

export function NotificationBell() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: notificationsKey, queryFn: () => api<{ items: Notif[]; unread: number }>("/notifications"), refetchInterval: 60_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: notificationsKey });
  const read = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "PATCH" }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api("/notifications/read-all", { method: "POST" }), onSuccess: refresh, onError: toast.error });
  const remove = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}`, { method: "DELETE" }), onSuccess: refresh, onError: toast.error });
  const unread = q.data?.unread ?? 0;

  return (
    <Menu
      trigger={(p) => (
        <Button variant="ghost" size="icon-sm" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} {...p} className="relative">
          <Bell />
          {unread > 0 && <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-mark-red px-1 text-[10px] leading-4 font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      )}
    >
      {(close) => (
        <div className="w-[min(22rem,calc(100vw-2rem))]">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-semibold">Notifications</p>
            <Button variant="ghost" size="sm" leftIcon={<CheckCheck />} disabled={!unread} onClick={() => readAll.mutate()}>
              Mark all read
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {q.isPending ? (
              <p className="px-2 py-6 text-center text-sm text-muted">Loading…</p>
            ) : q.isError ? (
              <p className="px-2 py-6 text-center text-sm text-danger">Couldn't load notifications.</p>
            ) : q.data.items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted">You're all caught up.</p>
            ) : (
              q.data.items.map((n) => (
                <div key={n.id} className={cn("group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-surface-2", !n.readAt && "bg-accent-soft/40")}>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      if (!n.readAt) read.mutate(n.id);
                      if (n.link) {
                        close();
                        navigate(n.link);
                      }
                    }}
                  >
                    <p className="text-[13px] font-medium text-ink">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-ink-2">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted">{relative(n.createdAt)}</p>
                  </button>
                  <button type="button" aria-label="Delete notification" onClick={() => remove.mutate(n.id)} className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Menu>
  );
}
