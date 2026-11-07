import type { Metadata } from "next";
import Link from "next/link";
import { CategoryIcon } from "@/components/events/category-icon";
import { getCategories } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await getCategories();
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold sm:text-4xl">Categories</h1>
      <p className="mt-2 text-muted-foreground">Find events by what you love.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link key={category.id} href={`/events?category=${category.slug}`} className="flex gap-4 rounded-xl border bg-card p-5 transition hover:border-white/20 hover:bg-accent">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-brand-glow">
              <CategoryIcon name={category.icon} className="size-6" />
            </span>
            <span>
              <span className="block font-semibold">{category.name}</span>
              {category.description && <span className="mt-0.5 block text-sm text-muted-foreground">{category.description}</span>}
              <span className="mt-1.5 block text-xs text-brand-glow">
                {category.eventCount} upcoming {category.eventCount === 1 ? "event" : "events"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
