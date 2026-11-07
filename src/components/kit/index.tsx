import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, humanize } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  good: "border-success/30 bg-success/10 text-success",
  warn: "border-warning/30 bg-warning/10 text-warning",
  bad: "border-danger/30 bg-danger/10 text-danger",
  info: "border-brand-glow/30 bg-primary/15 text-brand-glow",
  mute: "border-border bg-muted text-muted-foreground",
};

const STATUS_MAP: Record<string, keyof typeof STATUS_TONES> = {
  ACTIVE: "good", APPROVED: "good", PUBLISHED: "good", CONFIRMED: "good", VALID: "good", SUCCEEDED: "good", COMPLETED: "info", PAID: "good", ACCEPTED: "good", SENT: "good",
  PENDING: "warn", PENDING_APPROVAL: "warn", REQUESTED: "warn", INITIATED: "warn", PROCESSING: "warn", REVIEW: "warn", PARTIALLY_REFUNDED: "warn", SOLD_OUT: "info", DUPLICATE: "warn", LOGGED: "mute",
  REJECTED: "bad", SUSPENDED: "bad", CANCELLED: "bad", FAILED: "bad", INVALID: "bad", WRONG_EVENT: "bad", NOT_ACTIVE: "bad",
  DRAFT: "mute", EXPIRED: "mute", USED: "info", REFUNDED: "mute",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", STATUS_TONES[STATUS_MAP[status] ?? "mute"], className)}>
      {humanize(status)}
    </Badge>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
      {Icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        </span>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({ columns, rows, rowKey, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: React.ReactNode }) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column, index) => (
              <TableHead key={index} className={cn("h-11 whitespace-nowrap px-4 text-xs font-medium text-muted-foreground", column.className)}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column, index) => (
                <TableCell key={index} className={cn("px-4 py-3 align-middle text-sm", column.className)}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type Params = Record<string, string | string[] | undefined>;

function withParams(path: string, params: Params, patch: Record<string, string | number | undefined>) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) next.set(key, value);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

export function Pagination({ path, params, page, pages }: { path: string; params: Params; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
      <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
        {page > 1 ? (
          <Link href={withParams(path, params, { page: page - 1 })}>
            <ChevronLeft /> Previous
          </Link>
        ) : (
          <span>
            <ChevronLeft /> Previous
          </span>
        )}
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
        {page < pages ? (
          <Link href={withParams(path, params, { page: page + 1 })}>
            Next <ChevronRight />
          </Link>
        ) : (
          <span>
            Next <ChevronRight />
          </span>
        )}
      </Button>
    </nav>
  );
}

export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-input/20 px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 [&>option]:bg-popover",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** A plain GET form, so filters are linkable and work before any JavaScript loads. */
export function ListToolbar({ path, q, filters, placeholder = "Search" }: { path: string; q?: string; placeholder?: string; filters?: { name: string; value?: string; label: string; options: { value: string; label: string }[] }[] }) {
  return (
    <form action={path} className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-9" aria-label={placeholder} />
      </div>
      {filters?.map((filter) => (
        <NativeSelect key={filter.name} name={filter.name} defaultValue={filter.value ?? ""} aria-label={filter.label} className="w-auto">
          <option value="">{filter.label}: all</option>
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      <Button type="submit" variant="secondary">
        Apply
      </Button>
    </form>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function pageOf(params: Params) {
  const raw = Number(Array.isArray(params.page) ? params.page[0] : params.page);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}

export function textParam(params: Params, key: string) {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 100) || undefined;
}

export const DASH_PAGE_SIZE = 20;

export const pagesOf = (total: number, size = DASH_PAGE_SIZE) => Math.max(Math.ceil(total / size), 1);
