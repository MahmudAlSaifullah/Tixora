import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <LogoMark className="mx-auto size-12" />
        <h1 className="mt-6 text-3xl font-semibold">We couldn't find that page</h1>
        <p className="mt-2 text-muted-foreground">It may have moved, or the link may be wrong.</p>
        <Button asChild className="mt-6">
          <Link href="/events">Browse events</Link>
        </Button>
      </div>
    </main>
  );
}
