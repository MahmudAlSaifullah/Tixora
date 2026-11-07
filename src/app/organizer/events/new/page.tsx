import type { Metadata } from "next";
import { EventWizard } from "@/components/organizer/event-wizard";
import { PageHeader } from "@/components/kit";
import { requireOrgPage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Create Event" };

export default async function NewEventPage() {
  const { organization } = await requireOrgPage();
  const categories = await db.eventCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Create Event" description="Work through each step. You can save a draft at any time." />
      <EventWizard categories={categories} organizerName={organization.name} />
    </>
  );
}
