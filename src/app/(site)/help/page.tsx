import type { Metadata } from "next";
import { Mail, Phone } from "lucide-react";
import { db } from "@/server/db";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Help Center" };

export default async function HelpPage() {
  const [articles, settings] = await Promise.all([
    db.cmsPage.findMany({ where: { section: "help", isPublished: true }, orderBy: { sortOrder: "asc" } }),
    getSettings(),
  ]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold sm:text-4xl">Help Center</h1>
      <p className="mt-2 text-muted-foreground">Answers to the questions we hear most.</p>
      <div className="mt-8 divide-y rounded-xl border bg-card">
        {articles.map((article) => (
          <details key={article.id} className="group p-5">
            <summary className="cursor-pointer list-none font-medium marker:hidden">{article.title}</summary>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{article.body}</p>
          </details>
        ))}
      </div>
      <div className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="font-semibold">Still need help?</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-6">
          <a className="inline-flex items-center gap-2 hover:text-foreground" href={`mailto:${settings.supportEmail}`}>
            <Mail className="size-4" aria-hidden /> {settings.supportEmail}
          </a>
          <span className="inline-flex items-center gap-2">
            <Phone className="size-4" aria-hidden /> {settings.supportPhone}
          </span>
        </div>
      </div>
    </div>
  );
}
