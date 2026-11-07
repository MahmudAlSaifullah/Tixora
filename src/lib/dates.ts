// Event times are rendered in the event's own time zone, so server and browser always agree.

export const DEFAULT_TZ = "Asia/Dhaka";

type DateLike = Date | string | null | undefined;

function fmt(value: DateLike, options: Intl.DateTimeFormatOptions, tz = DEFAULT_TZ): string {
  if (!value) return "TBA";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...options }).format(new Date(value));
}

export const formatDate = (value: DateLike, tz?: string) =>
  fmt(value, { weekday: "short", day: "numeric", month: "short", year: "numeric" }, tz);

export const formatDateShort = (value: DateLike, tz?: string) =>
  fmt(value, { day: "numeric", month: "short" }, tz);

export const formatTime = (value: DateLike, tz?: string) =>
  fmt(value, { hour: "numeric", minute: "2-digit", hour12: true }, tz);

export const formatDateTime = (value: DateLike, tz?: string) =>
  fmt(value, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }, tz);

/** Date tile parts for event cards. */
export function dateParts(value: DateLike, tz?: string) {
  return {
    day: fmt(value, { day: "2-digit" }, tz),
    month: fmt(value, { month: "short" }, tz),
    weekday: fmt(value, { weekday: "short" }, tz),
  };
}

/** Value for <input type="datetime-local">, in the given zone. */
export function toLocalInput(value: DateLike, tz = DEFAULT_TZ): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Parses a datetime-local string entered in Bangladesh time (UTC+6, no DST). */
export function fromDhakaInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone ? value : `${value.length === 16 ? `${value}:00` : value}+06:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
