export const CITIES = ["Dhaka", "Chattogram", "Sylhet", "Khulna", "Rajshahi", "Barishal", "Rangpur", "Mymensingh", "Cox's Bazar"] as const;

/** Approximate city centres, for "Events near you". */
export const CITY_COORDS: Record<string, [number, number]> = {
  Dhaka: [23.8103, 90.4125],
  Chattogram: [22.3569, 91.7832],
  Sylhet: [24.8949, 91.8687],
  Khulna: [22.8456, 89.5403],
  Rajshahi: [24.3745, 88.6042],
  Barishal: [22.701, 90.3535],
  Rangpur: [25.7439, 89.2752],
  Mymensingh: [24.7471, 90.4203],
  "Cox's Bazar": [21.4272, 92.0058],
};

export const TICKET_KINDS = [
  { value: "GENERAL", label: "General Admission" },
  { value: "VIP", label: "VIP" },
  { value: "PREMIUM", label: "Premium" },
  { value: "EARLY_BIRD", label: "Early Bird" },
  { value: "CUSTOM", label: "Custom" },
] as const;

export const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  ORGANIZER: "/organizer/dashboard",
  SCANNER: "/scanner",
  CUSTOMER: "/my-tickets",
};

export const PAGE_SIZE = 12;

/** File downloads: plain links, since client-side navigation can't download a route handler's file. */
export const EXPORT_URLS = { sales: "/api/exports/sales", attendees: "/api/exports/attendees" } as const;
