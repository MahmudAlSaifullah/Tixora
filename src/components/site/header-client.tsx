"use client";

import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Bell, LayoutDashboard, LogOut, Menu, ReceiptText, ScanLine, Settings, Ticket, User } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { initials } from "@/lib/utils";

export interface Account {
  name: string;
  email: string;
  role: string;
  unread: number;
}

export function accountLinks(role: string) {
  const links = [
    { href: "/my-tickets", label: "My Tickets", icon: Ticket },
    { href: "/my-orders", label: "My Orders", icon: ReceiptText },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/profile", label: "Profile", icon: User },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  if (role === "SUPER_ADMIN") links.unshift({ href: "/admin", label: "Admin dashboard", icon: LayoutDashboard });
  if (role === "ORGANIZER") links.unshift({ href: "/organizer/dashboard", label: "Organizer dashboard", icon: LayoutDashboard });
  if (role === "ORGANIZER" || role === "SCANNER" || role === "SUPER_ADMIN") links.splice(1, 0, { href: "/scanner", label: "QR Scanner", icon: ScanLine });
  return links;
}

export function UserMenu({ account }: { account: Account }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" aria-label="My Account">
          {initials(account.name)}
          {account.unread > 0 && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-warning ring-2 ring-background" aria-label={`${account.unread} unread notifications`} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="truncate text-xs text-muted-foreground">{account.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accountLinks(account.role).map((link) => (
          <DropdownMenuItem key={link.href} asChild>
            <Link href={link.href}>
              <link.icon />
              {link.label}
              {link.href === "/notifications" && account.unread > 0 && <span className="ml-auto text-xs text-muted-foreground">{account.unread}</span>}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ redirectTo: "/" })}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MobileNav({ links, account }: { links: { href: string; label: string }[]; account: Account | null }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[84vw] max-w-xs gap-0 overflow-y-auto p-5">
        <SheetTitle className="flex items-center gap-2 pb-5 font-display text-lg tracking-widest">
          <LogoMark className="size-7" /> TIXORA
        </SheetTitle>
        <nav className="flex flex-col gap-1" aria-label="Mobile">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={close} className="rounded-lg px-3 py-2.5 text-[15px] hover:bg-accent">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="my-4 border-t" />
        {account ? (
          <nav className="flex flex-col gap-1" aria-label="Account">
            {accountLinks(account.role).map((link) => (
              <Link key={link.href} href={link.href} onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] hover:bg-accent">
                <link.icon className="size-4 text-muted-foreground" aria-hidden /> {link.label}
              </Link>
            ))}
            <button onClick={() => signOut({ redirectTo: "/" })} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] hover:bg-accent">
              <LogOut className="size-4 text-muted-foreground" aria-hidden /> Log out
            </button>
          </nav>
        ) : (
          <div className="grid gap-2">
            <Button asChild variant="secondary">
              <Link href="/login" onClick={close}>
                Login
              </Link>
            </Button>
            <Button asChild>
              <Link href="/register" onClick={close}>
                Register
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
