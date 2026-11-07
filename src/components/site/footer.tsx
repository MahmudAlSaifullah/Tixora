import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";

const SOCIAL_PATHS: Record<string, string> = {
  Facebook: "M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.4H7.4v3.2h2.8V22h3.3Z",
  Instagram: "M12 7.4A4.6 4.6 0 1 0 12 16.6 4.6 4.6 0 0 0 12 7.4Zm0 7.6a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm5.9-7.8a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21 8.3c-.1-1.4-.4-2.7-1.4-3.7s-2.3-1.3-3.7-1.4c-1.5-.1-5.9-.1-7.4 0-1.4.1-2.7.4-3.7 1.4S3.5 6.9 3.4 8.3c-.1 1.5-.1 5.9 0 7.4.1 1.4.4 2.7 1.4 3.7s2.3 1.3 3.7 1.4c1.5.1 5.9.1 7.4 0 1.4-.1 2.7-.4 3.7-1.4s1.3-2.3 1.4-3.7c.1-1.5.1-5.9 0-7.4Zm-1.9 9a3 3 0 0 1-1.7 1.7c-1.2.5-3.9.4-5.2.4s-4 .1-5.2-.4a3 3 0 0 1-1.7-1.7c-.5-1.2-.4-3.9-.4-5.2s-.1-4 .4-5.2A3 3 0 0 1 6.5 5c1.2-.5 3.9-.4 5.2-.4s4-.1 5.2.4a3 3 0 0 1 1.7 1.7c.5 1.2.4 3.9.4 5.2s.1 4-.4 5.2Z",
  YouTube: "M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.5 12c0 1.3.2 2.5.5 3.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.3.5-2.5.5-3.8s-.2-2.5-.5-3.8ZM10 15.2V8.8l5.3 3.2-5.3 3.2Z",
};

export async function SiteFooter() {
  const [settings, pages, categories] = await Promise.all([
    getSettings(),
    db.cmsPage.findMany({ where: { isPublished: true, section: { in: ["legal", "company"] } }, orderBy: { sortOrder: "asc" }, select: { slug: true, title: true, section: true } }),
    db.eventCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, take: 5, select: { name: true, slug: true } }),
  ]);
  const socials = [
    { name: "Facebook", url: settings.socialFacebook },
    { name: "Instagram", url: settings.socialInstagram },
    { name: "YouTube", url: settings.socialYoutube },
  ].filter((social) => social.url);
  const legal = pages.filter((p) => p.section === "legal");
  const company = pages.filter((p) => p.section === "company");

  return (
    <footer className="mt-20 border-t bg-sidebar">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">Discover, book and enter events across Bangladesh, with secure payments and instant QR tickets.</p>
          <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Mail className="size-4" aria-hidden />
              <a href={`mailto:${settings.supportEmail}`} className="hover:text-foreground">
                {settings.supportEmail}
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4" aria-hidden /> {settings.supportPhone}
            </li>
            <li className="flex items-center gap-2">
              <MapPin className="size-4" aria-hidden /> {settings.supportAddress}
            </li>
          </ul>
          {socials.length > 0 && (
            <div className="mt-5 flex gap-2">
              {socials.map((social) => (
                <a key={social.name} href={social.url} target="_blank" rel="noopener noreferrer" aria-label={social.name} className="grid size-9 place-items-center rounded-full border text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground">
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                    <path d={SOCIAL_PATHS[social.name]} />
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>
        <FooterColumn title="Explore" links={[{ href: "/events", label: "All events" }, ...categories.map((c) => ({ href: `/events?category=${c.slug}`, label: c.name }))]} />
        <FooterColumn title="Tixora" links={[{ href: "/organizers", label: "For organizers" }, { href: "/help", label: "Help center" }, ...company.map((p) => ({ href: `/pages/${p.slug}`, label: p.title }))]} />
        <FooterColumn title="Policies" links={legal.map((p) => ({ href: `/pages/${p.slug}`, label: p.title }))} />
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-muted-foreground sm:px-6">© {new Date().getFullYear()} Tixora. All rights reserved.</p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
