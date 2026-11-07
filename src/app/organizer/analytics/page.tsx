import type { Metadata } from "next";
import { AnalyticsBoard } from "@/components/charts/analytics-board";
import { PageHeader } from "@/components/kit";
import { requireOrgPage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Analytics" };

export default async function OrganizerAnalyticsPage() {
  const { organization } = await requireOrgPage();
  return (
    <>
      <PageHeader title="Analytics" description="Sales, conversion and attendance for your events." />
      <AnalyticsBoard organizationId={organization.id} />
    </>
  );
}
