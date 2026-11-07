import Link from "next/link";
import { Search } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { MobileNav, UserMenu } from "./header-client";

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/events", label: "Explore Events" },
  { href: "/categories", label: "Categories" },
  { href: "/organizers", label: "For Organizers" },
  { href: "/help", label: "Help Center" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null } }) : 0;
  const account = user ? { name: user.name, email: user.email, role: user.role, unread } : null;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <MobileNav links={NAV_LINKS} account={account} />
        <Logo />
        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <form action="/events" className="relative hidden xl:block" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" placeholder="Search events" aria-label="Search events" className="h-9 w-52 rounded-full border border-input bg-muted/60 pl-9 pr-3 text-sm outline-none transition focus-visible:w-64 focus-visible:border-ring" />
          </form>
          <Button variant="ghost" size="icon" asChild className="xl:hidden">
            <Link href="/events" aria-label="Search events">
              <Search />
            </Link>
          </Button>
          {account ? (
            <UserMenu account={account} />
          ) : (
            <>
              <Button variant="ghost" asChild className="hidden sm:inline-flex">
                <Link href="/login">Login</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Register</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
