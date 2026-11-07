import { LogoMark } from "@/components/brand/logo";

export function AuthShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        <LogoMark className="size-10" />
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function safeCallback(value: string | string[] | undefined): string | null {
  const url = Array.isArray(value) ? value[0] : value;
  // Local paths only, so the login page can never bounce someone to another site.
  return url && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") ? url : null;
}
