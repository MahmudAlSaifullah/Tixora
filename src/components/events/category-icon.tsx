import { Footprints, GraduationCap, Laugh, Landmark, Music, Palette, PartyPopper, Presentation, Sparkles, Trophy, UtensilsCrossed, Wrench, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = { Footprints, GraduationCap, Laugh, Landmark, Music, Palette, PartyPopper, Presentation, Sparkles, Trophy, UtensilsCrossed, Wrench };

export const CATEGORY_ICON_NAMES = Object.keys(ICONS);

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}
