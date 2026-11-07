import Link from "next/link";
import { useId } from "react";
import { cn } from "@/lib/utils";

/** The mark: a punched ticket with a T standing in the middle. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a6bff" />
          <stop offset="1" stopColor="#2f8bff" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d="M7 4h18a4 4 0 0 1 4 4v5a3 3 0 0 0 0 6v5a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-5a3 3 0 0 0 0-6V8a4 4 0 0 1 4-4Z" />
      <path fill="#fff" d="M9.5 9.5h13v3.4h-4.8V23h-3.4V12.9H9.5z" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 rounded-md", className)} aria-label="Tixora home">
      <LogoMark />
      <span className="font-display text-[1.28rem] font-bold tracking-[0.08em] text-foreground">TIXORA</span>
    </Link>
  );
}
