import { db, Prisma } from "../db";
import { PAGE_SIZE } from "@/lib/constants";
import { availableOf } from "./booking";

export const PUBLIC_STATUSES = ["PUBLISHED", "SOLD_OUT", "COMPLETED"] as const;

const cardInclude = {
  category: { select: { name: true, slug: true } },
  venue: { select: { name: true, city: true } },
  organization: { select: { name: true, slug: true } },
  ticketTypes: {
    where: { isActive: true },
    select: { priceMinor: true, inventory: { select: { total: true, reserved: true, sold: true } } },
  },
} satisfies Prisma.EventInclude;

type CardRow = Prisma.EventGetPayload<{ include: typeof cardInclude }>;

export function toEventCard(event: CardRow) {
  const prices = event.ticketTypes.map((t) => t.priceMinor);
  const available = event.ticketTypes.reduce((sum, t) => sum + availableOf(t.inventory), 0);
  const total = event.ticketTypes.reduce((sum, t) => sum + (t.inventory?.total ?? 0), 0);
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    shortDescription: event.shortDescription,
    coverImageUrl: event.coverImageUrl,
    startsAt: event.startsAt,
    timezone: event.timezone,
    mode: event.mode,
    status: event.status,
    isDemo: event.isDemo,
    currency: event.currency,
    category: event.category.name,
    categorySlug: event.category.slug,
    venue: event.mode === "ONLINE" ? "Online event" : event.venue?.name ?? "Venue to be announced",
    city: event.venue?.city ?? null,
    organizer: event.organizerName ?? event.organization.name,
    startingPriceMinor: prices.length ? Math.min(...prices) : null,
    available,
    almostGone: total > 0 && available > 0 && available / total <= 0.15,
  };
}

export type EventCard = ReturnType<typeof toEventCard>;

const upcomingWhere = (now = new Date()): Prisma.EventWhereInput => ({
  status: { in: ["PUBLISHED", "SOLD_OUT"] },
  OR: [{ endsAt: { gte: now } }, { endsAt: null, startsAt: { gte: now } }],
});

const cards = (rows: CardRow[]) => rows.map(toEventCard);

export async function getHomepageData() {
  const upcoming = upcomingWhere();
  const [featured, trending, soon, categories, stats] = await Promise.all([
    db.event.findMany({ where: { ...upcoming, isFeatured: true }, include: cardInclude, orderBy: { startsAt: "asc" }, take: 6 }),
    db.event.findMany({ where: upcoming, include: cardInclude, orderBy: [{ bookings: { _count: "desc" } }, { viewCount: "desc" }], take: 8 }),
    db.event.findMany({ where: upcoming, include: cardInclude, orderBy: { startsAt: "asc" }, take: 8 }),
    getCategories(),
    db.event.count({ where: upcoming }),
  ]);
  return { featured: cards(featured), trending: cards(trending), upcoming: cards(soon), categories, liveEventCount: stats };
}

export async function getCategories() {
  const rows = await db.eventCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { events: { where: upcomingWhere() } } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon, description: c.description, eventCount: c._count.events }));
}

export async function getEventCities() {
  const rows = await db.venue.findMany({
    where: { events: { some: upcomingWhere() } },
    distinct: ["city"],
    select: { city: true },
    orderBy: { city: "asc" },
  });
  return rows.map((r) => r.city);
}

export async function getEventsNear(city: string, take = 4) {
  const rows = await db.event.findMany({
    where: { ...upcomingWhere(), venue: { city: { equals: city, mode: "insensitive" } } },
    include: cardInclude,
    orderBy: { startsAt: "asc" },
    take,
  });
  return cards(rows);
}

export interface EventFilters {
  q?: string;
  category?: string;
  city?: string;
  from?: string;
  to?: string;
  minPrice?: number;
  maxPrice?: number;
  when?: "upcoming" | "ongoing" | "completed" | "all";
  sort?: "date" | "newest" | "popular";
  page?: number;
  pageSize?: number;
}

export async function searchEvents(filters: EventFilters) {
  const now = new Date();
  const and: Prisma.EventWhereInput[] = [{ status: { in: [...PUBLIC_STATUSES] } }];

  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { shortDescription: { contains: filters.q, mode: "insensitive" } },
        { organization: { name: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }
  if (filters.category) and.push({ category: { slug: filters.category } });
  if (filters.city) and.push({ venue: { city: { equals: filters.city, mode: "insensitive" } } });
  if (filters.from) and.push({ startsAt: { gte: new Date(`${filters.from}T00:00:00+06:00`) } });
  if (filters.to) and.push({ startsAt: { lte: new Date(`${filters.to}T23:59:59+06:00`) } });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    and.push({
      ticketTypes: {
        some: {
          isActive: true,
          priceMinor: {
            ...(filters.minPrice !== undefined ? { gte: Math.round(filters.minPrice * 100) } : {}),
            ...(filters.maxPrice !== undefined ? { lte: Math.round(filters.maxPrice * 100) } : {}),
          },
        },
      },
    });
  }
  const when = filters.when ?? "upcoming";
  if (when === "upcoming") and.push({ status: { not: "COMPLETED" }, startsAt: { gt: now } });
  if (when === "ongoing") and.push({ status: { not: "COMPLETED" }, startsAt: { lte: now }, endsAt: { gte: now } });
  if (when === "completed") and.push({ OR: [{ status: "COMPLETED" }, { endsAt: { lt: now } }] });

  const orderBy: Prisma.EventOrderByWithRelationInput[] =
    filters.sort === "newest"
      ? [{ publishedAt: "desc" }, { createdAt: "desc" }]
      : filters.sort === "popular"
        ? [{ bookings: { _count: "desc" } }, { viewCount: "desc" }]
        : [{ startsAt: when === "completed" ? "desc" : "asc" }];

  const pageSize = Math.min(filters.pageSize ?? PAGE_SIZE, 48);
  const page = Math.max(filters.page ?? 1, 1);
  const where: Prisma.EventWhereInput = { AND: and };
  const [rows, total] = await Promise.all([
    db.event.findMany({ where, include: cardInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.event.count({ where }),
  ]);
  return { events: cards(rows), total, page, pageSize, pages: Math.max(Math.ceil(total / pageSize), 1) };
}

export function parseEventFilters(params: Record<string, string | string[] | undefined>): EventFilters {
  const text = (key: string) => {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    return single?.trim().slice(0, 100) || undefined;
  };
  const number = (key: string) => {
    const value = Number(text(key));
    return text(key) !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const date = (key: string) => {
    const value = text(key);
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  };
  const when = text("when");
  const sort = text("sort");
  return {
    q: text("q"),
    category: text("category"),
    city: text("city"),
    from: date("from"),
    to: date("to"),
    minPrice: number("minPrice"),
    maxPrice: number("maxPrice"),
    when: when === "ongoing" || when === "completed" || when === "all" ? when : "upcoming",
    sort: sort === "newest" || sort === "popular" ? sort : "date",
    page: Math.floor(number("page") ?? 1) || 1,
  };
}

/** Public event detail. Unpublished events are visible only to the caller's own preview path. */
export async function getPublicEvent(slug: string) {
  const event = await db.event.findFirst({
    where: { slug, status: { in: [...PUBLIC_STATUSES, "CANCELLED"] } },
    include: {
      category: true,
      venue: true,
      organization: { select: { name: true, slug: true, logoUrl: true, description: true, website: true, _count: { select: { events: true } } } },
      images: { orderBy: { sortOrder: "asc" } },
      ticketTypes: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { priceMinor: "asc" }], include: { inventory: true } },
      reviews: { where: { isHidden: false }, orderBy: { createdAt: "desc" }, take: 6, include: { user: { select: { name: true } } } },
    },
  });
  if (!event) return null;
  return event;
}

export type PublicEvent = NonNullable<Awaited<ReturnType<typeof getPublicEvent>>>;

export async function getRelatedEvents(event: { id: string; categoryId: string }, take = 4) {
  const rows = await db.event.findMany({
    where: { ...upcomingWhere(), id: { not: event.id }, categoryId: event.categoryId },
    include: cardInclude,
    orderBy: { startsAt: "asc" },
    take,
  });
  if (rows.length >= take) return cards(rows);
  const more = await db.event.findMany({
    where: { ...upcomingWhere(), id: { notIn: [event.id, ...rows.map((r) => r.id)] } },
    include: cardInclude,
    orderBy: { startsAt: "asc" },
    take: take - rows.length,
  });
  return cards([...rows, ...more]);
}

export async function getOrganizerProfile(slug: string) {
  const organization = await db.organization.findFirst({
    where: { slug, status: "APPROVED" },
    select: { id: true, name: true, description: true, logoUrl: true, website: true, city: true },
  });
  if (!organization) return null;
  const events = await db.event.findMany({
    where: { organizationId: organization.id, status: { in: [...PUBLIC_STATUSES] } },
    include: cardInclude,
    orderBy: { startsAt: "desc" },
    take: 24,
  });
  return { ...organization, events: cards(events) };
}
