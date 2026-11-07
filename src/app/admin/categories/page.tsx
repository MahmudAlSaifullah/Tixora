import type { Metadata } from "next";
import { CategoryIcon, CATEGORY_ICON_NAMES } from "@/components/events/category-icon";
import { DataTable, Field, NativeSelect, PageHeader, Panel, StatusBadge } from "@/components/kit";
import { ActionButton, ActionForm } from "@/components/kit/action-form";
import { Input } from "@/components/ui/input";
import { saveCategory, toggleCategory } from "@/server/actions/admin";
import { requireRolePage } from "@/server/auth/guards";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Category Management" };

function IconSelect({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <NativeSelect id={id} name="icon" defaultValue={defaultValue ?? "Sparkles"}>
      {CATEGORY_ICON_NAMES.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </NativeSelect>
  );
}

export default async function AdminCategoriesPage() {
  await requireRolePage(["SUPER_ADMIN"]);
  const categories = await db.eventCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { events: true } } } });
  return (
    <>
      <PageHeader title="Category Management" description="Categories organize the public event listing." />
      <Panel title="New category" className="mb-5">
        <ActionForm action={saveCategory.bind(null, null)} submitLabel="Add category" resetOnSuccess className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_170px_2fr_100px_auto]">
          <Field label="Name" htmlFor="new-name">
            <Input id="new-name" name="name" required />
          </Field>
          <Field label="Icon" htmlFor="new-icon">
            <IconSelect id="new-icon" />
          </Field>
          <Field label="Description" htmlFor="new-description">
            <Input id="new-description" name="description" />
          </Field>
          <Field label="Order" htmlFor="new-order">
            <Input id="new-order" name="sortOrder" type="number" defaultValue={categories.length} />
          </Field>
        </ActionForm>
      </Panel>
      <DataTable
        rows={categories}
        rowKey={(c) => c.id}
        columns={[
          { header: "", cell: (c) => <CategoryIcon name={c.icon} className="size-4 text-brand-glow" /> },
          {
            header: "Category",
            cell: (c) => (
              <ActionForm action={saveCategory.bind(null, c.id)} submitLabel="Save" submitProps={{ variant: "outline", size: "sm" }} className="grid min-w-[560px] grid-cols-[150px_120px_1fr_64px_auto] items-center gap-1.5">
                <Input name="name" defaultValue={c.name} aria-label="Name" className="h-8" required />
                <NativeSelect name="icon" defaultValue={c.icon} aria-label="Icon" className="h-8">
                  {CATEGORY_ICON_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
                <Input name="description" defaultValue={c.description ?? ""} aria-label="Description" className="h-8" />
                <Input name="sortOrder" type="number" defaultValue={c.sortOrder} aria-label="Order" className="h-8" />
              </ActionForm>
            ),
          },
          { header: "Events", cell: (c) => c._count.events },
          { header: "Status", cell: (c) => <StatusBadge status={c.isActive ? "ACTIVE" : "DRAFT"} /> },
          { header: "", cell: (c) => <ActionButton action={toggleCategory.bind(null, c.id)} label={c.isActive ? "Hide" : "Show"} variant="ghost" /> },
        ]}
      />
    </>
  );
}
