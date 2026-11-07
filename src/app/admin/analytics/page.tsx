import type { Metadata } from "next";
import { AnalyticsBoard } from "@/components/charts/analytics-board";
import { PageHeader } from "@/components/kit";
import { requireRolePage } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Analytics" };

export default async function AdminAnalyticsPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  return (
    <>
      <PageHeader title="Analytics" description="Sales, conversion and attendance across every organizer." />
      <AnalyticsBoard />
    </>
  );
}
