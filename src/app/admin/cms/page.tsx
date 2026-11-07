import type { Metadata } from "next";
import { Field, NativeSelect, PageHeader, Panel, StatusBadge } from "@/components/kit";
import { ActionButton, ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteCmsPage, saveCmsPage } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "CMS" };

const SECTIONS = [
  { value: "help", label: "Help Center article" },
  { value: "legal", label: "Policy (footer)" },
  { value: "company", label: "Company page (footer)" },
];

function PageFields({ prefix, page }: { prefix: string; page?: { title: string; body: string; section: string; sortOrder: number; isPublished: boolean } }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[1fr_220px_100px]">
        <Field label="Title" htmlFor={`${prefix}-title`}>
          <Input id={`${prefix}-title`} name="title" defaultValue={page?.title} required />
        </Field>
        <Field label="Section" htmlFor={`${prefix}-section`}>
          <NativeSelect id={`${prefix}-section`} name="section" defaultValue={page?.section ?? "company"}>
            {SECTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Order" htmlFor={`${prefix}-order`}>
          <Input id={`${prefix}-order`} name="sortOrder" type="number" defaultValue={page?.sortOrder ?? 0} />
        </Field>
      </div>
      <Field label="Content" htmlFor={`${prefix}-body`} hint="Plain text. Leave a blank line between paragraphs.">
        <Textarea id={`${prefix}-body`} name="body" rows={6} defaultValue={page?.body} required />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPublished" defaultChecked={page?.isPublished ?? true} className="size-4 accent-[var(--primary)]" /> Published
      </label>
    </>
  );
}

export default async function AdminCmsPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  const pages = await db.cmsPage.findMany({ orderBy: [{ section: "asc" }, { sortOrder: "asc" }] });
  return (
    <>
      <PageHeader title="CMS" description="Help Center articles, policies and company pages." />
      <Panel title="New page" className="mb-5">
        <ActionForm action={saveCmsPage.bind(null, null)} submitLabel="Create page" resetOnSuccess>
          <PageFields prefix="new" />
        </ActionForm>
      </Panel>
      <ul className="space-y-2">
        {pages.map((page) => (
          <li key={page.id}>
            <details className="rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
                <span className="min-w-0 flex-1 truncate font-medium">{page.title}</span>
                <span className="text-xs text-muted-foreground">{SECTIONS.find((s) => s.value === page.section)?.label}</span>
                <StatusBadge status={page.isPublished ? "ACTIVE" : "DRAFT"} />
              </summary>
              <div className="space-y-3 border-t p-4">
                <ActionForm action={saveCmsPage.bind(null, page.id)} submitLabel="Save changes">
                  <PageFields prefix={page.id} page={page} />
                </ActionForm>
                <ActionButton action={deleteCmsPage.bind(null, page.id)} label="Delete page" variant="ghost" confirm={`"${page.title}" will be removed from the site.`} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
