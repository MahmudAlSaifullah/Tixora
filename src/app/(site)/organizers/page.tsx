import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BarChart3, Banknote, QrCode, Tag, Ticket, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/kit";
import { ActionForm } from "@/components/kit/action-form";
import { formatMoney } from "@/lib/money";
import { getCurrentUser, getMembership } from "@/server/auth/guards";
import { applyAsOrganizer } from "@/server/actions/account";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "For Organizers", description: "Sell tickets, track sales and check guests in with Tixora." };

const FEATURES = [
  { icon: Ticket, title: "Flexible ticketing", text: "General, VIP, early bird or your own categories, with sale windows and purchase limits." },
  { icon: BarChart3, title: "Live analytics", text: "Daily sales, category performance, conversion and attendance, all in one dashboard." },
  { icon: QrCode, title: "Phone-based check-in", text: "Your team scans tickets with any phone. A ticket works once, however many gates you run." },
  { icon: Tag, title: "Promo codes", text: "Reward early fans with fixed or percentage discounts, limited by event, category or customer." },
  { icon: Users, title: "Team access", text: "Add managers and gate staff, with access limited to what each person needs." },
  { icon: Banknote, title: "Clear payouts", text: "See what you've earned, what's pending, and request a payout when you're ready." },
];

export default async function OrganizersPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const membership = user ? await getMembership(user.id) : null;

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <Image src="/demo/covers/conf2.jpg" alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
        <div className="hero-grain absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
          <h1 className="max-w-3xl text-balance text-4xl font-bold leading-tight sm:text-6xl">Your event, sold out and running smoothly.</h1>
          <p className="mt-4 max-w-xl text-white/80 sm:text-lg">Everything you need to sell tickets and manage entry in Bangladesh, from your first draft to the last guest through the gate.</p>
          <Button asChild size="lg" className="mt-7">
            <a href="#get-started">Get started</a>
          </Button>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border bg-card p-5">
              <feature.icon className="size-6 text-brand-glow" aria-hidden />
              <h2 className="mt-3 font-semibold">{feature.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{feature.text}</p>
            </div>
          ))}
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-2" id="get-started">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Simple pricing</h2>
            <p className="mt-2 text-muted-foreground">Listing an event is free. We earn only when you sell.</p>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between rounded-lg border bg-card p-4">
                <dt className="text-muted-foreground">Commission on ticket sales</dt>
                <dd className="font-semibold">{settings.commissionBps / 100}%</dd>
              </div>
              <div className="flex justify-between rounded-lg border bg-card p-4">
                <dt className="text-muted-foreground">Booking fee, paid by the customer</dt>
                <dd className="font-semibold">{settings.platformFeeBps / 100}%</dd>
              </div>
              <div className="flex justify-between rounded-lg border bg-card p-4">
                <dt className="text-muted-foreground">Minimum payout</dt>
                <dd className="font-semibold">{formatMoney(settings.minPayoutMinor)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border bg-card p-6">
            {!user && (
              <>
                <h2 className="text-xl font-semibold">Create your organizer account</h2>
                <p className="mt-1 text-sm text-muted-foreground">Register or log in first, then come back here to set up your organization.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href="/register?callbackUrl=/organizers%23get-started">Register</Link>
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/login?callbackUrl=/organizers%23get-started">Log in</Link>
                  </Button>
                </div>
              </>
            )}
            {user && membership && (
              <>
                <h2 className="text-xl font-semibold">You're all set, {membership.organization.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Head to your dashboard to create and manage events.</p>
                <Button asChild className="mt-5">
                  <Link href="/organizer/dashboard">Open dashboard</Link>
                </Button>
              </>
            )}
            {user && !membership && (
              <>
                <h2 className="text-xl font-semibold">Set up your organization</h2>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">You can start drafting straight away. We review new organizers before their first event goes live.</p>
                <ActionForm action={applyAsOrganizer} submitLabel="Create organizer account">
                  <Field label="Organization name" htmlFor="org-name">
                    <Input id="org-name" name="name" required minLength={2} maxLength={120} />
                  </Field>
                  <Field label="City" htmlFor="org-city">
                    <Input id="org-city" name="city" maxLength={60} />
                  </Field>
                  <Field label="Contact phone" htmlFor="org-phone">
                    <Input id="org-phone" name="phone" type="tel" />
                  </Field>
                </ActionForm>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
