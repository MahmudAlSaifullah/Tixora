import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/kit";
import { ActionButton } from "@/components/kit/action-form";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUserPage } from "@/server/auth/guards";
import { markAllNotificationsRead } from "@/server/actions/account";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUserPage("/notifications");
  const notifications = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  const unread = notifications.filter((n) => !n.readAt).length;
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Notifications</h1>
        {unread > 0 && <ActionButton action={markAllNotificationsRead} label="Mark all read" variant="ghost" />}
      </div>
      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="Booking and event updates will appear here." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {notifications.map((n) => {
            const body = (
              <div className={cn("p-4", !n.readAt && "bg-primary/5")}>
                <p className="flex items-center gap-2 text-sm font-medium">
                  {!n.readAt && <span className="size-2 rounded-full bg-brand-glow" aria-label="Unread" />}
                  {n.title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block transition-colors hover:bg-accent">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
