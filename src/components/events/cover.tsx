import Image from "next/image";
import { Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Event imagery. Local and Cloudinary files go through the image optimizer. Any other https host
 * an organizer linked to is shown as-is, because the optimizer only accepts allow-listed hosts.
 */
export function Cover({ src, alt, sizes, priority, className }: { src?: string | null; alt: string; sizes: string; priority?: boolean; className?: string }) {
  if (!src) {
    return (
      <div className={cn("grid size-full place-items-center bg-gradient-to-br from-primary/40 via-secondary to-card", className)}>
        <Ticket className="size-10 text-white/30" aria-hidden />
      </div>
    );
  }
  const optimizable = src.startsWith("/") || src.startsWith("https://res.cloudinary.com/");
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={!optimizable} className={cn("object-cover", className)} />;
}
