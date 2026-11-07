"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  BadgePercent, Banknote, BarChart3, CalendarCheck, CalendarDays, CalendarPlus, ClipboardCheck, CreditCard, FileText, Globe, LayoutDashboard, LogOut, Menu, Percent, QrCode, ReceiptText, RotateCcw, ScanLine, ScrollText, Settings, Shapes, Tags, Ticket, UserCog, Users, Building2,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn, initials } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const ORGANIZER_NAV: NavItem[] = [
  { href: "/organizer/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/organizer/events", label: "My Events", icon: CalendarDays },
  { href: "/organizer/events/new", label: "Create Event", icon: CalendarPlus },
  { href: "/organizer/tickets", label: "Ticket Management", icon: Ticket },
  { href: "/organizer/orders", label: "Orders", icon: ReceiptText },
  { href: "/organizer/attendees", label: "Attendees", icon: Users },
  { href: "/scanner", label: "QR Scanner", icon: QrCode },
  { href: "/organizer/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/organizer/promo-codes", label: "Promo Codes", icon: BadgePercent },
  { href: "/organizer/payouts", label: "Payouts", icon: Banknote },
  { href: "/organizer/team", label: "Team Management", icon: UserCog },
  { href: "/organizer/settings", label: "Organization Settings", icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/approvals", label: "Event Approval", icon: ClipboardCheck },
  { href: "/admin/events", label: "Events", icon: CalendarCheck },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/organizers", label: "Organizers", icon: Building2 },
  { href: "/admin/tickets", label: "Tickets", icon: Ticket },
  { href: "/admin/bookings", label: "Bookings", icon: ReceiptText },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/refunds", label: "Refunds", icon: RotateCcw },
  { href: "/admin/commissions", label: "Commissions", icon: Percent },
  { href: "/admin/promo-codes", label: "Promo Codes", icon: Tags },
  { href: "/admin/categories", label: "Categories", icon: Shapes },
  { href: "/admin/payouts", label: "Payouts", icon: Banknote },
  { href: "/admin/staff", label: "Scanner and Staff", icon: ScanLine },
  { href: "/admin/cms", label: "CMS", icon: FileText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
];

function NavList({ items, onNavigate, badges }: { items: NavItem[]; onNavigate?: () => void; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const roots = new Set(["/admin", "/organizer/dashboard"]);
  const hrefs = items.map((i) => i.href);
  return (
    <nav className="space-y-0.5" aria-label="Dashboard">
      {items.map((item) => {
        const longerMatch = hrefs.some((h) => h !== item.href && h.startsWith(item.href) && pathname.startsWith(h));
        const active = pathname === item.href || (!roots.has(item.href) && pathname.startsWith(`${item.href}/`) && !longerMatch);
        const badge = badges?.[item.href];
        return (
          <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors", active ? "bg-primary/15 font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <item.icon className={cn("size-4 shrink-0", active && "text-brand-glow")} aria-hidden />
            <span className="truncate">{item.label}</span>
            {badge ? <span className="ml-auto rounded-full bg-warning px-1.5 text-[11px] font-semibold text-black">{badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ variant, title, subtitle, user, badges, banner, children }: { variant: "organizer" | "admin"; title: string; subtitle?: string; user: { name: string; email: string }; badges?: Record<string, number>; banner?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const items = variant === "admin" ? ADMIN_NAV : ORGANIZER_NAV;

  const sidebarBody = (onNavigate?: () => void) => (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavList items={items} onNavigate={onNavigate} badges={badges} />
      </div>
      <div className="border-t p-3">
        <Link href="/" onClick={onNavigate} className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <Globe className="size-4" aria-hidden /> View website
        </Link>
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials(user.name)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
          <button type="button" onClick={() => signOut({ redirectTo: "/" })} aria-label="Log out" className="text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-16 shrink-0 flex-col justify-center border-b px-5">
          <Logo />
        </div>
        <p className="truncate px-6 pt-3 text-xs font-medium text-muted-foreground">{title}</p>
        {sidebarBody()}
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open dashboard menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[84vw] max-w-xs flex-col gap-0 bg-sidebar p-0">
            <SheetTitle className="border-b p-4 font-display text-base">{title}</SheetTitle>
            {sidebarBody(() => setOpen(false))}
          </SheetContent>
        </Sheet>
        <span className="truncate text-sm font-medium">{subtitle ?? title}</span>
      </header>

      <main className="mx-auto min-w-0 max-w-[1400px] p-4 sm:p-6 lg:p-8">
        {banner}
        {children}
      </main>
    </div>
  );
}
