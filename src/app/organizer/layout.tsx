import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/shell";
import { requireOrgPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: { default: "Organizer", template: "%s | Tixora Organizer" }, robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const { user, organization } = await requireOrgPage();
  const notice: Record<string, string> = {
    PENDING: "Your organizer account is awaiting approval. You can create drafts now, and submit them once approved.",
    REJECTED: `Your organizer application wasn't approved.${organization.statusReason ? ` Reason: ${organization.statusReason}` : ""}`,
    SUSPENDED: `This organizer account is suspended.${organization.statusReason ? ` Reason: ${organization.statusReason}` : ""}`,
  };
  const message = notice[organization.status];
  return (
    <DashboardShell
      variant="organizer"
      title={organization.name}
      subtitle={organization.name}
      user={{ name: user.name, email: user.email }}
      banner={
        message ? (
          <div role="status" className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {message}
          </div>
        ) : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
