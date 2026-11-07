import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventWizard } from "@/components/organizer/event-wizard";
import { PageHeader, StatusBadge } from "@/components/kit";
import { requireOrgPage } from "@/server/auth/guards";
import { db } from "@/server/db";
import { eventToDraft } from "@/server/services/event-management";

export const metadata: Metadata = { title: "Edit Event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await requireOrgPage();
  // Scoped by organization: another organizer's event id is simply not found.
  const draft = await eventToDraft(organization.id, id);
  if (!draft) notFound();
  const categories = await db.eventCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  const { id: eventId, status, slug, rejectionReason, ...values } = draft;
  return (
    <>
      <PageHeader title={values.title} description={slug} actions={<StatusBadge status={status} />} />
      {rejectionReason && (
        <p role="alert" className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm">
          Changes requested: {rejectionReason}
        </p>
      )}
      <EventWizard categories={categories} organizerName={organization.name} eventId={eventId} status={status} initial={values} />
    </>
  );
}
