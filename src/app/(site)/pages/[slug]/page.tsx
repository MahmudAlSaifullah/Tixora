import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";

type Props = { params: Promise<{ slug: string }> };

const load = (slug: string) => db.cmsPage.findFirst({ where: { slug, isPublished: true } });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await load((await params).slug);
  return { title: page?.title ?? "Not found" };
}

export default async function CmsPage({ params }: Props) {
  const page = await load((await params).slug);
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold sm:text-4xl">{page.title}</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-foreground/85">
        {page.body.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  );
}
