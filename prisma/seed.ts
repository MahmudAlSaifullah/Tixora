// Demo data for Tixora. Every event, organizer and person here is fictional, and events carry
// isDemo=true so the site labels them as sample data. Dates are relative to the moment of seeding.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { bookingReference, merchantTxnId } from "../src/server/crypto";
import { recordCommission } from "../src/server/services/commission";
import { priceOrder } from "../src/server/services/pricing";
import { issueTickets } from "../src/server/services/tickets";
import { syncSoldOut } from "../src/server/services/inventory";
import { SETTING_DEFAULTS } from "../src/server/settings";
import type { TicketKind } from "../src/generated/prisma/client";

const DAY = 86_400_000;
const now = Date.now();
const daysFromNow = (days: number, hour = 18, minute = 0) => {
  // Hours are Bangladesh time (UTC+6).
  const date = new Date(now + days * DAY);
  date.setUTCHours(hour - 6, minute, 0, 0);
  return date;
};

// Deterministic randomness, so reseeding gives the same shape of data.
let seedValue = 20261106;
const random = () => {
  seedValue = (seedValue * 1664525 + 1013904223) % 4294967296;
  return seedValue / 4294967296;
};
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

const FIRST_NAMES = ["Ayesha", "Rafiq", "Nusrat", "Tanvir", "Farhana", "Imran", "Sadia", "Mahmud", "Tasnim", "Arif", "Lamia", "Sabbir", "Rumana", "Shakil", "Mithila", "Fahim", "Jannat", "Rakib", "Anika", "Nayeem"];
const LAST_NAMES = ["Rahman", "Hossain", "Ahmed", "Islam", "Chowdhury", "Karim", "Sultana", "Akter", "Khan", "Siddique", "Uddin", "Haque"];
const fullName = () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

const CATEGORIES = [
  ["Concerts", "concerts", "Music", "Live music, from arenas to intimate stages."],
  ["Sports", "sports", "Trophy", "Matches, tournaments and competitions."],
  ["Marathons", "marathons", "Footprints", "Road races, fun runs and ultras."],
  ["Festivals", "festivals", "PartyPopper", "Multi-day celebrations and community fairs."],
  ["Workshops", "workshops", "Wrench", "Hands-on sessions to learn a new skill."],
  ["Conferences", "conferences", "Presentation", "Industry talks and networking."],
  ["Exhibitions", "exhibitions", "Palette", "Art, design and trade shows."],
  ["Comedy", "comedy", "Laugh", "Stand-up and live comedy nights."],
  ["University Events", "university-events", "GraduationCap", "Campus fests and student-run events."],
  ["Cultural Programs", "cultural-programs", "Landmark", "Heritage, dance, theatre and song."],
  ["Food and Drink", "food-and-drink", "UtensilsCrossed", "Food festivals and tastings."],
  ["Other", "other", "Sparkles", "Everything else worth going out for."],
] as const;

interface TicketSeed {
  name: string;
  kind: TicketKind;
  price: number;
  total: number;
  description?: string;
  maxPerOrder?: number;
  perUserLimit?: number;
  salesEndDays?: number;
  salesStartDays?: number;
}

interface EventSeed {
  slug: string;
  title: string;
  category: string;
  org: string;
  cover: string;
  short: string;
  description: string;
  startDays: number;
  startHour: number;
  durationHours: number;
  venue: { name: string; address: string; city: string; capacity: number; lat: number; lng: number };
  tickets: TicketSeed[];
  schedule: { time: string; title: string }[];
  rules: string;
  ageRestriction?: string;
  featured?: boolean;
  guestCheckout?: boolean;
  orders: number;
  status?: "PUBLISHED" | "COMPLETED" | "PENDING_APPROVAL" | "DRAFT";
}

const TERMS = "Tickets are personal and valid for one entry only. Do not share your QR code. The organizer may refuse entry to anyone breaking the event rules.";
const REFUND = "Refund requests are accepted up to 7 days before the event. The booking fee is non-refundable except when an event is cancelled.";

const EVENTS: EventSeed[] = [
  {
    slug: "neon-monsoon-live-dhaka",
    title: "Neon Monsoon Live: Dhaka",
    category: "concerts",
    org: "pulse-live",
    cover: "/demo/covers/concert3.jpg",
    short: "A night of Bangladeshi rock and electronic acts under one roof, with a full light and sound production.",
    description: "Neon Monsoon returns to Dhaka with its biggest line-up so far. Four fictional headline acts share a single stage for an evening of Bangla rock, electronic sets and surprise collaborations.\n\nDoors open early, with food stalls and a merchandise village in the outer hall. This is a seated and standing show, so choose the ticket that suits how you like to experience live music.",
    startDays: 9,
    startHour: 18,
    durationHours: 5,
    venue: { name: "Meghna Convention Arena", address: "Plot 12, Purbachal Link Road", city: "Dhaka", capacity: 6000, lat: 23.82, lng: 90.45 },
    tickets: [
      { name: "Early Bird", kind: "EARLY_BIRD", price: 800, total: 300, description: "Limited first release, standing floor.", maxPerOrder: 4, salesEndDays: 3 },
      { name: "General Admission", kind: "GENERAL", price: 1200, total: 2500, description: "Standing floor access.", maxPerOrder: 8 },
      { name: "VIP", kind: "VIP", price: 3500, total: 300, description: "Front-of-stage zone with a dedicated bar and entrance.", maxPerOrder: 4, perUserLimit: 6 },
      { name: "Premium Seated", kind: "PREMIUM", price: 2200, total: 600, description: "Reserved balcony seating.", maxPerOrder: 6 },
    ],
    schedule: [{ time: "4:30 PM", title: "Doors open, food and merch village" }, { time: "6:00 PM", title: "Opening act" }, { time: "7:30 PM", title: "Main acts" }, { time: "10:30 PM", title: "Encore and close" }],
    rules: "No outside food or drink. No professional cameras. Bags are searched at entry.",
    ageRestriction: "13+. Under-16s must be with an adult.",
    featured: true,
    orders: 46,
  },
  {
    slug: "padma-riverside-half-marathon",
    title: "Padma Riverside Half Marathon",
    category: "marathons",
    org: "runbd-collective",
    cover: "/demo/covers/run1.jpg",
    short: "21K, 10K and 5K routes along the river at sunrise, with timing chips, medals and hydration points.",
    description: "Run the river at first light. The Padma Riverside Half Marathon offers chip-timed 21K and 10K races, and a relaxed 5K fun run for families and first-timers.\n\nEvery finisher receives a medal and a race T-shirt. Water and first-aid stations are placed along the full route.",
    startDays: 23,
    startHour: 5,
    durationHours: 5,
    venue: { name: "Padma Riverside Park", address: "Mawa Approach Road", city: "Dhaka", capacity: 3000, lat: 23.46, lng: 90.25 },
    tickets: [
      { name: "21K Half Marathon", kind: "CUSTOM", price: 1500, total: 800, description: "Chip timing, medal and T-shirt.", maxPerOrder: 4 },
      { name: "10K Run", kind: "CUSTOM", price: 1000, total: 1000, description: "Chip timing, medal and T-shirt.", maxPerOrder: 4 },
      { name: "5K Fun Run", kind: "GENERAL", price: 500, total: 1200, description: "Medal and T-shirt.", maxPerOrder: 6 },
    ],
    schedule: [{ time: "5:00 AM", title: "Bib collection and warm-up" }, { time: "5:45 AM", title: "21K start" }, { time: "6:15 AM", title: "10K start" }, { time: "6:45 AM", title: "5K start" }, { time: "9:30 AM", title: "Awards" }],
    rules: "Runners must collect their bib in person with a photo ID. Headphones are discouraged on open sections of the route.",
    ageRestriction: "21K and 10K: 16+. 5K: all ages.",
    featured: true,
    orders: 34,
  },
  {
    slug: "dhaka-tech-summit",
    title: "Dhaka Tech Summit",
    category: "conferences",
    org: "pulse-live",
    cover: "/demo/covers/conf2.jpg",
    short: "Two days of talks on AI, fintech and building products for Bangladesh, plus founder meetups.",
    description: "Dhaka Tech Summit brings engineers, founders and product teams together for two days of practical talks. Sessions cover applied AI, digital payments, scaling local startups and hiring.\n\nYour pass includes lunch on both days, access to the expo hall and the founders' evening meetup.",
    startDays: 16,
    startHour: 9,
    durationHours: 33,
    venue: { name: "Bashundhara Expo Centre", address: "Hall 4, Kuril Road", city: "Dhaka", capacity: 1500, lat: 23.82, lng: 90.43 },
    tickets: [
      { name: "Student Pass", kind: "CUSTOM", price: 1500, total: 200, description: "Valid student ID required at entry.", maxPerOrder: 1, perUserLimit: 1 },
      { name: "Conference Pass", kind: "GENERAL", price: 4000, total: 900, description: "Both days, lunch and expo access.", maxPerOrder: 10 },
      { name: "VIP Pass", kind: "VIP", price: 9000, total: 100, description: "Front-row seating and the speakers' dinner.", maxPerOrder: 4 },
    ],
    schedule: [{ time: "Day 1, 9:00 AM", title: "Registration and keynote" }, { time: "Day 1, 2:00 PM", title: "AI and fintech tracks" }, { time: "Day 2, 10:00 AM", title: "Founder panels" }, { time: "Day 2, 6:00 PM", title: "Closing meetup" }],
    rules: "Carry your QR ticket and a photo ID. Passes are not transferable.",
    featured: true,
    orders: 24,
  },
  {
    slug: "bay-t20-championship-final",
    title: "Bay T20 Championship Final",
    category: "sports",
    org: "bay-sports-league",
    cover: "/demo/covers/cricket.jpg",
    short: "The fictional league's two top sides meet under lights in Chattogram for the T20 title.",
    description: "The season comes down to one night. Watch the two best sides of the Bay T20 Championship play for the trophy, with a pre-match show and fan zone from early afternoon.",
    startDays: 12,
    startHour: 18,
    durationHours: 4,
    venue: { name: "Karnaphuli Cricket Ground", address: "Agrabad Access Road", city: "Chattogram", capacity: 12000, lat: 22.33, lng: 91.81 },
    tickets: [
      { name: "General Stand", kind: "GENERAL", price: 300, total: 6000, maxPerOrder: 8 },
      { name: "Club Stand", kind: "PREMIUM", price: 800, total: 2000, description: "Covered seating.", maxPerOrder: 6 },
      { name: "Grand Pavilion", kind: "VIP", price: 2500, total: 400, description: "Padded seats and hospitality.", maxPerOrder: 4 },
    ],
    schedule: [{ time: "3:00 PM", title: "Fan zone opens" }, { time: "5:30 PM", title: "Toss" }, { time: "6:00 PM", title: "First ball" }],
    rules: "No bottles, flags on poles or fireworks. Re-entry is not allowed.",
    featured: true,
    guestCheckout: true,
    orders: 38,
  },
  {
    slug: "spring-campus-carnival",
    title: "Spring Campus Carnival",
    category: "university-events",
    org: "campus-connect",
    cover: "/demo/covers/fest1.jpg",
    short: "Northfield University's student-run spring fest: band battles, food courts and an open-air finale.",
    description: "Run entirely by students of the fictional Northfield University, the Spring Campus Carnival fills the grounds with a battle of the bands, a dozen food stalls, games and a fireworks-free open-air finale.\n\nOpen to students and the public.",
    startDays: 6,
    startHour: 11,
    durationHours: 11,
    venue: { name: "Northfield University Grounds", address: "Sector 10, Uttara", city: "Dhaka", capacity: 4000, lat: 23.87, lng: 90.39 },
    tickets: [
      { name: "Student Entry", kind: "CUSTOM", price: 200, total: 2000, description: "Show a valid student ID.", maxPerOrder: 2, perUserLimit: 2 },
      { name: "General Entry", kind: "GENERAL", price: 400, total: 1500, maxPerOrder: 6 },
    ],
    schedule: [{ time: "11:00 AM", title: "Gates open, stalls and games" }, { time: "3:00 PM", title: "Battle of the bands" }, { time: "7:30 PM", title: "Open-air finale" }],
    rules: "Campus rules apply. Smoking is not allowed on the grounds.",
    guestCheckout: true,
    orders: 30,
  },
  {
    slug: "product-design-bootcamp",
    title: "Product Design Bootcamp",
    category: "workshops",
    org: "kolpo-arts",
    cover: "/demo/covers/work2.jpg",
    short: "A hands-on day of user research, wireframing and prototyping with working designers.",
    description: "Spend a focused day learning how products are designed. You'll work in small groups to research a real problem, sketch solutions and build a clickable prototype, with feedback from working designers.\n\nBring a laptop. No previous design experience is needed.",
    startDays: 19,
    startHour: 10,
    durationHours: 7,
    venue: { name: "Kolpo Studio", address: "House 44, Road 11, Banani", city: "Dhaka", capacity: 40, lat: 23.79, lng: 90.4 },
    tickets: [
      { name: "Early Bird", kind: "EARLY_BIRD", price: 2500, total: 10, maxPerOrder: 2, salesEndDays: 8 },
      { name: "Standard Seat", kind: "GENERAL", price: 3500, total: 25, maxPerOrder: 3, description: "Includes lunch and materials." },
    ],
    schedule: [{ time: "10:00 AM", title: "Research methods" }, { time: "1:00 PM", title: "Lunch" }, { time: "2:00 PM", title: "Prototyping and critique" }],
    rules: "Please bring a laptop. Seats cannot be transferred after the sale closes.",
    orders: 14,
  },
  {
    slug: "adda-after-dark-standup",
    title: "Adda After Dark: Stand-up Night",
    category: "comedy",
    org: "pulse-live",
    cover: "/demo/covers/comedy.jpg",
    short: "Five comics, one mic and a lot of Dhaka traffic jokes. This show has already taken place.",
    description: "An evening of Bangla and English stand-up from five comics on the rise. This past show is kept in the demo so that attendance analytics and reviews have real data to show.",
    startDays: -12,
    startHour: 20,
    durationHours: 2,
    venue: { name: "The Laugh Room", address: "Level 3, Dhanmondi 27", city: "Dhaka", capacity: 220, lat: 23.75, lng: 90.38 },
    tickets: [
      { name: "General Admission", kind: "GENERAL", price: 600, total: 160, maxPerOrder: 6 },
      { name: "Front Row", kind: "VIP", price: 1200, total: 30, description: "You may become part of the show.", maxPerOrder: 4 },
    ],
    schedule: [{ time: "7:30 PM", title: "Doors" }, { time: "8:00 PM", title: "Show" }],
    rules: "Strong language. Recording the show is not allowed.",
    ageRestriction: "18+",
    orders: 52,
    status: "COMPLETED",
  },
  {
    slug: "shilpo-contemporary-art-expo",
    title: "Shilpo Contemporary Art Expo",
    category: "exhibitions",
    org: "kolpo-arts",
    cover: "/demo/covers/art2.jpg",
    short: "Sixty fictional emerging artists from across Bangladesh show painting, print and sculpture.",
    description: "A week-long exhibition of new work from emerging artists across Bangladesh. Pieces are available to buy, and guided walkthroughs run every afternoon.",
    startDays: 28,
    startHour: 11,
    durationHours: 150,
    venue: { name: "Rajshahi Arts Pavilion", address: "Padma Garden Road", city: "Rajshahi", capacity: 500, lat: 24.37, lng: 88.6 },
    tickets: [
      { name: "Day Pass", kind: "GENERAL", price: 150, total: 2000, maxPerOrder: 10 },
      { name: "Patron Pass", kind: "VIP", price: 1500, total: 80, description: "Opening night and a private tour.", maxPerOrder: 2 },
    ],
    schedule: [{ time: "Daily, 11:00 AM", title: "Gallery opens" }, { time: "Daily, 4:00 PM", title: "Guided walkthrough" }],
    rules: "Flash photography isn't allowed. Please do not touch the artworks.",
    guestCheckout: true,
    orders: 12,
  },
  {
    slug: "boishakhi-sur-cultural-evening",
    title: "Boishakhi Sur: A Cultural Evening",
    category: "cultural-programs",
    org: "kolpo-arts",
    cover: "/demo/covers/fest2.jpg",
    short: "Folk song, classical dance and theatre in Sylhet, celebrating the heritage of the region.",
    description: "An evening of folk music, classical dance and short theatre from artists of the Sylhet region. Boishakhi Sur celebrates the songs and stories that have been passed down through generations.",
    startDays: 34,
    startHour: 17,
    durationHours: 4,
    venue: { name: "Surma Open-Air Theatre", address: "Surma Riverbank", city: "Sylhet", capacity: 1200, lat: 24.89, lng: 91.87 },
    tickets: [
      { name: "Community Pass", kind: "GENERAL", price: 0, total: 300, description: "Free entry, registration required.", maxPerOrder: 4 },
      { name: "Reserved Seat", kind: "PREMIUM", price: 500, total: 400, maxPerOrder: 6 },
    ],
    schedule: [{ time: "5:00 PM", title: "Folk music" }, { time: "6:30 PM", title: "Classical dance" }, { time: "8:00 PM", title: "Theatre" }],
    rules: "Seating opens 30 minutes before the start.",
    orders: 10,
  },
  {
    slug: "coxs-bazar-food-carnival",
    title: "Cox's Bazar Food Carnival",
    category: "food-and-drink",
    org: "campus-connect",
    cover: "/demo/covers/food.jpg",
    short: "Seafood, street food and home-style Bangladeshi cooking by the beach for one long weekend.",
    description: "Forty food stalls, cooking demonstrations and live music on the beach. Your entry ticket includes food tokens, which can be spent at any stall.",
    startDays: 41,
    startHour: 12,
    durationHours: 58,
    venue: { name: "Kolatoli Beach Grounds", address: "Kolatoli Road", city: "Cox's Bazar", capacity: 5000, lat: 21.42, lng: 91.98 },
    tickets: [
      { name: "Entry with Food Tokens", kind: "GENERAL", price: 700, total: 3000, description: "Includes ৳300 in food tokens.", maxPerOrder: 8 },
      { name: "Family Pack", kind: "CUSTOM", price: 2200, total: 500, description: "Entry for four, with ৳1,000 in food tokens.", maxPerOrder: 2 },
    ],
    schedule: [{ time: "12:00 PM", title: "Stalls open" }, { time: "4:00 PM", title: "Cooking demos" }, { time: "7:00 PM", title: "Live music" }],
    rules: "Food tokens cannot be refunded once redeemed.",
    orders: 16,
  },
  // Two extra events exercise the approval queue and draft editing. They are not public.
  {
    slug: "chattogram-indie-music-weekender",
    title: "Chattogram Indie Music Weekender",
    category: "concerts",
    org: "pulse-live",
    cover: "/demo/covers/concert2.jpg",
    short: "Two days of independent bands by the port. Awaiting admin approval in the demo.",
    description: "A two-day indie music weekend with more than twenty fictional bands across two stages. This demo event sits in the admin approval queue, so you can try approving or rejecting it.",
    startDays: 48,
    startHour: 15,
    durationHours: 30,
    venue: { name: "Port City Amphitheatre", address: "Patenga Beach Road", city: "Chattogram", capacity: 3500, lat: 22.24, lng: 91.8 },
    tickets: [{ name: "Weekend Pass", kind: "GENERAL", price: 1800, total: 2500, maxPerOrder: 6 }],
    schedule: [{ time: "3:00 PM", title: "Gates open" }],
    rules: "No outside drinks.",
    orders: 0,
    status: "PENDING_APPROVAL",
  },
  {
    slug: "winter-jazz-rooftop-draft",
    title: "Winter Jazz on the Rooftop",
    category: "concerts",
    org: "pulse-live",
    cover: "/demo/covers/concert1.jpg",
    short: "An unfinished draft, for trying out the event editor.",
    description: "This is a draft event in the demo data. It is only visible to its organizer until it is submitted for approval.",
    startDays: 60,
    startHour: 19,
    durationHours: 3,
    venue: { name: "Skyline Rooftop", address: "Gulshan Avenue", city: "Dhaka", capacity: 150, lat: 23.79, lng: 90.41 },
    tickets: [{ name: "General Admission", kind: "GENERAL", price: 1500, total: 120, maxPerOrder: 4 }],
    schedule: [],
    rules: "",
    orders: 0,
    status: "DRAFT",
  },
];

const ORGS = [
  { slug: "pulse-live", name: "Pulse Live Bangladesh", city: "Dhaka", description: "Fictional live events company behind concerts, comedy and conferences. Demo data.", email: "hello@pulse-live.test", commissionBps: null },
  { slug: "runbd-collective", name: "RunBD Collective", city: "Dhaka", description: "Fictional running community organizing road races. Demo data.", email: "hello@runbd.test", commissionBps: 300 },
  { slug: "bay-sports-league", name: "Bay Sports League", city: "Chattogram", description: "Fictional regional sports league. Demo data.", email: "hello@baysports.test", commissionBps: null },
  { slug: "campus-connect", name: "Campus Connect", city: "Dhaka", description: "Fictional student and community events group. Demo data.", email: "hello@campusconnect.test", commissionBps: null },
  { slug: "kolpo-arts", name: "Kolpo Arts Society", city: "Dhaka", description: "Fictional arts and culture society. Demo data.", email: "hello@kolpo.test", commissionBps: null },
];

const CMS = [
  ["about", "About Tixora", "company", "Tixora is an online event ticketing and management platform built for Bangladesh.\n\nWe help people discover what is on near them and book with confidence, and we give organizers the tools to sell tickets and run a smooth entry."],
  ["contact", "Contact us", "company", "Questions about an order? Open your order page and quote your booking reference when you email us.\n\nOrganizers can reach the partnerships team using the same address."],
  ["terms", "Terms of Service", "legal", "This is sample policy text for the demo. Have your legal adviser replace it before launch.\n\nBy using Tixora you agree to provide accurate information, to use tickets only for personal entry, and not to resell tickets unless the organizer allows it. Organizers are responsible for delivering their events as described."],
  ["privacy", "Privacy Policy", "legal", "This is sample policy text for the demo. Have your legal adviser replace it before launch.\n\nWe collect the details needed to deliver your tickets: name, email, phone number and attendee names. We share attendee details with the organizer of the event you booked. We never see or store card numbers, wallet PINs or OTPs, which are handled by the payment provider."],
  ["refund-policy", "Refund Policy", "legal", "This is sample policy text for the demo. Have your legal adviser replace it before launch.\n\nEach event sets its own refund policy, shown on the event page. If an event is cancelled, your ticket price and booking fee are refunded to your original payment method."],
] as const;

const HELP = [
  ["How do I find my tickets?", "Log in and open My Tickets. Your tickets are also attached as a PDF to your confirmation email. If you checked out as a guest, use the link in that email."],
  ["My payment went through but I have no ticket.", "Tickets are issued as soon as the payment provider confirms your payment, which is usually a few seconds. Open My Orders to see the current status. If a payment can't be matched to your booking, our team reviews it and refunds it if needed. You don't need to pay again."],
  ["How long are my tickets held during checkout?", "Your tickets are held for a short time while you pay, and the checkout page shows a countdown. If the time runs out, the tickets return to sale and you can book again."],
  ["How does entry work?", "Show your QR code at the gate, on your phone or printed. Each code can be used once, so please keep it private."],
  ["Can I get a refund?", "Open your order and choose Request a refund. Requests are reviewed against the event's refund policy. If an event is cancelled, refunds are opened automatically."],
  ["How do I sell tickets on Tixora?", "Visit For Organizers to set up your organizer account. You can draft events straight away, and our team reviews events before they go on sale."],
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("The demo seed must not run in production.");
  const existing = await db.user.count();
  if (existing > 0) {
    console.log(`The database already has ${existing} users, so nothing was changed. Use "npm run db:reset" for a clean demo database.`);
    return;
  }

  console.log("Seeding roles, categories and settings...");
  const roleRows = await Promise.all(
    (
      [
        ["CUSTOMER", "Customer", "Browses events and buys tickets."],
        ["ORGANIZER", "Organizer", "Creates and manages events for an organization."],
        ["SCANNER", "Scanner / Event staff", "Checks tickets at assigned events."],
        ["SUPER_ADMIN", "Super admin", "Complete platform control."],
      ] as const
    ).map(([key, name, description]) => db.role.create({ data: { key, name, description } })),
  );
  const roleId = (key: string) => roleRows.find((r) => r.key === key)!.id;

  const categories = await Promise.all(
    CATEGORIES.map(([name, slug, icon, description], sortOrder) => db.eventCategory.create({ data: { name, slug, icon, description, sortOrder } })),
  );

  await db.platformSetting.createMany({
    data: [
      { key: "commissionBps", value: SETTING_DEFAULTS.commissionBps },
      { key: "platformFeeBps", value: SETTING_DEFAULTS.platformFeeBps },
      { key: "taxBps", value: SETTING_DEFAULTS.taxBps },
      // Placeholder destinations. Replace with Tixora's real profiles under Admin > Settings.
      { key: "socialFacebook", value: "https://www.facebook.com" },
      { key: "socialInstagram", value: "https://www.instagram.com" },
      { key: "socialYoutube", value: "https://www.youtube.com" },
    ],
  });

  console.log("Seeding users...");
  const passwordHash = await hashPassword("Demo@12345");
  const verified = new Date(now - 60 * DAY);
  const makeUser = (email: string, name: string, role: string, phone?: string) =>
    db.user.create({ data: { email, name, phone, passwordHash, roleId: roleId(role), emailVerifiedAt: verified, createdAt: new Date(now - between(20, 90) * DAY) } });

  const admin = await makeUser("admin@tixora.test", "Tixora Admin", "SUPER_ADMIN", "+8801700000001");
  const organizer = await makeUser("organizer@tixora.test", "Rafiq Ahmed", "ORGANIZER", "+8801700000002");
  const organizer2 = await makeUser("runbd@tixora.test", "Farhana Karim", "ORGANIZER");
  const organizer3 = await makeUser("baysports@tixora.test", "Imran Chowdhury", "ORGANIZER");
  const organizer4 = await makeUser("campus@tixora.test", "Tasnim Haque", "ORGANIZER");
  const organizer5 = await makeUser("kolpo@tixora.test", "Sadia Rahman", "ORGANIZER");
  const scanner = await makeUser("scanner@tixora.test", "Sabbir Hossain", "SCANNER", "+8801700000003");
  const customer = await makeUser("customer@tixora.test", "Ayesha Rahman", "CUSTOMER", "+8801700000004");
  const pendingOrganizer = await makeUser("neworg@tixora.test", "Nayeem Islam", "ORGANIZER");
  const customers = [customer];
  for (let i = 0; i < 24; i++) {
    const name = fullName();
    customers.push(await makeUser(`customer${i + 1}@tixora.test`, name, "CUSTOMER", `+88017${String(10000000 + i).slice(0, 8)}`));
  }

  console.log("Seeding organizers...");
  const owners: Record<string, string> = { "pulse-live": organizer.id, "runbd-collective": organizer2.id, "bay-sports-league": organizer3.id, "campus-connect": organizer4.id, "kolpo-arts": organizer5.id };
  const orgIds: Record<string, string> = {};
  for (const org of ORGS) {
    const row = await db.organization.create({
      data: {
        ...org,
        status: "APPROVED",
        phone: "+8801700000000",
        payoutMethod: "bKash",
        payoutAccountName: org.name,
        payoutAccountNumber: "017XXXXXXXX (demo)",
        members: { create: { userId: owners[org.slug], role: "OWNER" } },
      },
    });
    orgIds[org.slug] = row.id;
  }
  await db.organization.create({
    data: { name: "Horizon Events (pending)", slug: "horizon-events", city: "Khulna", status: "PENDING", description: "A fictional organizer awaiting approval. Demo data.", email: pendingOrganizer.email, members: { create: { userId: pendingOrganizer.id, role: "OWNER" } } },
  });

  console.log("Seeding events...");
  const eventRows: Record<string, { id: string; orgId: string; tickets: { id: string; name: string; priceMinor: number; maxPerOrder: number; total: number }[]; seed: EventSeed }> = {};
  for (const seed of EVENTS) {
    const startsAt = daysFromNow(seed.startDays, seed.startHour);
    const endsAt = new Date(startsAt.getTime() + seed.durationHours * 3_600_000);
    const venue = await db.venue.create({
      data: { name: seed.venue.name, address: seed.venue.address, city: seed.venue.city, capacity: seed.venue.capacity, latitude: seed.venue.lat, longitude: seed.venue.lng, organizationId: orgIds[seed.org] },
    });
    const status = seed.status ?? "PUBLISHED";
    const isPublic = status === "PUBLISHED" || status === "COMPLETED";
    const event = await db.event.create({
      data: {
        slug: seed.slug,
        title: seed.title,
        shortDescription: seed.short,
        description: seed.description,
        coverImageUrl: seed.cover,
        status,
        startsAt,
        endsAt,
        categoryId: categories.find((c) => c.slug === seed.category)!.id,
        organizationId: orgIds[seed.org],
        venueId: venue.id,
        schedule: seed.schedule,
        rules: seed.rules || null,
        terms: TERMS,
        refundPolicy: REFUND,
        ageRestriction: seed.ageRestriction,
        guestCheckout: seed.guestCheckout ?? false,
        isFeatured: seed.featured ?? false,
        isDemo: true,
        viewCount: seed.orders * between(8, 20),
        submittedAt: status !== "DRAFT" ? new Date(now - 40 * DAY) : null,
        publishedAt: isPublic ? new Date(now - between(30, 45) * DAY) : null,
        approvedById: isPublic ? admin.id : null,
        createdAt: new Date(now - 50 * DAY),
      },
    });
    const tickets = [];
    for (const [sortOrder, t] of seed.tickets.entries()) {
      const row = await db.ticketType.create({
        data: {
          eventId: event.id,
          name: t.name,
          kind: t.kind,
          description: t.description,
          priceMinor: t.price * 100,
          maxPerOrder: t.maxPerOrder ?? 10,
          perUserLimit: t.perUserLimit,
          salesEndAt: t.salesEndDays ? daysFromNow(t.salesEndDays, 23, 59) : null,
          sortOrder,
          inventory: { create: { total: t.total } },
        },
      });
      tickets.push({ id: row.id, name: row.name, priceMinor: row.priceMinor, maxPerOrder: row.maxPerOrder, total: t.total });
    }
    eventRows[seed.slug] = { id: event.id, orgId: orgIds[seed.org], tickets, seed };
  }

  console.log("Seeding promo codes...");
  const neon = eventRows["neon-monsoon-live-dhaka"];
  await db.promoCode.createMany({
    data: [
      { code: "WELCOME10", name: "Welcome campaign", discountType: "PERCENT", discountValue: 1000, maxDiscountMinor: 50_000, perUserLimit: 1, expiresAt: new Date(now + 90 * DAY) },
      { code: "NEON200", name: "Neon Monsoon launch offer", discountType: "FIXED", discountValue: 20_000, organizationId: neon.orgId, eventId: neon.id, minOrderMinor: 100_000, usageLimit: 200, expiresAt: new Date(now + 8 * DAY) },
      { code: "RUNTOGETHER", name: "Running club discount", discountType: "PERCENT", discountValue: 1500, organizationId: orgIds["runbd-collective"], usageLimit: 100 },
      { code: "EXPIRED50", name: "Expired sample code", discountType: "PERCENT", discountValue: 5000, expiresAt: new Date(now - 5 * DAY) },
    ],
  });

  console.log("Seeding bookings, payments and tickets (this takes a moment)...");
  const METHODS = ["Visa (test)", "Mastercard (test)", "bKash (test)", "bKash (test)", "Nagad (test)"];
  const settings = SETTING_DEFAULTS;

  async function makeConfirmedBooking(eventKey: string, buyer: { id: string; name: string; email: string; phone: string | null }, confirmedAt: Date, quantityHint?: number) {
    const event = eventRows[eventKey];
    const paidTypes = event.tickets.filter((t) => t.priceMinor > 0 || event.tickets.length === 1);
    const type = random() < 0.15 ? pick(event.tickets) : pick(paidTypes);
    const quantity = quantityHint ?? Math.min(between(1, 4), type.maxPerOrder);
    const inventory = await db.ticketInventory.findUniqueOrThrow({ where: { ticketTypeId: type.id } });
    if (inventory.sold + quantity > inventory.total) return null;

    const subtotal = type.priceMinor * quantity;
    const prices = priceOrder(subtotal, 0, settings);
    return db.$transaction(
      async (tx) => {
        const booking = await tx.booking.create({
          data: {
            reference: bookingReference(),
            idempotencyKey: randomUUID(),
            userId: buyer.id,
            eventId: event.id,
            organizationId: event.orgId,
            status: "CONFIRMED",
            contactName: buyer.name,
            contactEmail: buyer.email,
            contactPhone: buyer.phone ?? "+8801700000000",
            ...prices,
            expiresAt: new Date(confirmedAt.getTime() + 600_000),
            confirmedAt,
            createdAt: new Date(confirmedAt.getTime() - 240_000),
          },
        });
        const item = await tx.bookingItem.create({
          data: { bookingId: booking.id, ticketTypeId: type.id, ticketTypeName: type.name, unitPriceMinor: type.priceMinor, quantity, lineTotalMinor: subtotal },
        });
        await tx.attendee.createMany({
          data: Array.from({ length: quantity }, (_, i) => ({ bookingId: booking.id, bookingItemId: item.id, name: i === 0 ? buyer.name : fullName() })),
        });
        await tx.ticketInventory.update({ where: { ticketTypeId: type.id }, data: { sold: { increment: quantity } } });
        if (prices.totalMinor > 0) {
          const payment = await tx.payment.create({
            data: {
              bookingId: booking.id,
              gateway: "test",
              mode: "SANDBOX",
              status: "SUCCEEDED",
              amountMinor: prices.totalMinor,
              merchantTxnId: merchantTxnId(),
              gatewayTxnId: `TEST-${bookingReference()}`,
              method: pick(METHODS),
              paidAt: confirmedAt,
              createdAt: new Date(confirmedAt.getTime() - 120_000),
            },
          });
          await tx.paymentTransaction.create({ data: { paymentId: payment.id, type: "VERIFY", status: "SUCCEEDED", externalId: payment.gatewayTxnId, amountMinor: payment.amountMinor, createdAt: confirmedAt } });
        }
        await issueTickets(tx, booking.id);
        await tx.ticket.updateMany({ where: { bookingId: booking.id }, data: { issuedAt: confirmedAt } });
        await recordCommission(tx, { ...booking, promoCode: null });
        await tx.platformCommission.update({ where: { bookingId: booking.id }, data: { createdAt: confirmedAt } });
        return booking;
      },
      { timeout: 30_000 },
    );
  }

  // The demo customer always holds tickets to try out, including one for the scanner's event.
  const featuredForCustomer = await makeConfirmedBooking("spring-campus-carnival", customer, new Date(now - 3 * DAY), 2);
  await makeConfirmedBooking("neon-monsoon-live-dhaka", customer, new Date(now - 5 * DAY), 2);
  await makeConfirmedBooking("adda-after-dark-standup", customer, new Date(now - 20 * DAY), 2);

  for (const event of Object.values(eventRows)) {
    const span = event.seed.startDays > 0 ? 38 : 30;
    for (let i = 0; i < event.seed.orders; i++) {
      // Sales pick up as an event gets closer, so charts have a believable shape.
      const recency = Math.pow(random(), 1.8);
      const offset = event.seed.startDays > 0 ? recency * span : 13 + recency * span;
      await makeConfirmedBooking(event.seed.slug, pick(customers), new Date(now - offset * DAY - between(0, 20) * 3_600_000));
    }
  }

  // Unconverted checkouts, so the conversion funnel isn't a flat 100%.
  for (let i = 0; i < 40; i++) {
    const event = pick(Object.values(eventRows).filter((e) => e.seed.orders > 0 && e.seed.status !== "COMPLETED"));
    const type = pick(event.tickets);
    const buyer = pick(customers);
    const started = new Date(now - between(1, 30) * DAY);
    const subtotal = type.priceMinor;
    const booking = await db.booking.create({
      data: {
        reference: bookingReference(),
        userId: buyer.id,
        eventId: event.id,
        organizationId: event.orgId,
        status: "EXPIRED",
        contactName: buyer.name,
        contactEmail: buyer.email,
        contactPhone: buyer.phone ?? "+8801700000000",
        ...priceOrder(subtotal, 0, settings),
        expiresAt: new Date(started.getTime() + 600_000),
        createdAt: started,
        items: { create: { ticketTypeId: type.id, ticketTypeName: type.name, unitPriceMinor: type.priceMinor, quantity: 1, lineTotalMinor: subtotal } },
      },
    });
    if (i % 2 === 0 && booking.totalMinor > 0) {
      await db.payment.create({
        data: { bookingId: booking.id, gateway: "test", mode: "SANDBOX", status: i % 4 === 0 ? "FAILED" : "CANCELLED", amountMinor: booking.totalMinor, merchantTxnId: merchantTxnId(), failureReason: "Sample unsuccessful test attempt", createdAt: started },
      });
    }
  }

  console.log("Seeding check-ins, staff and reviews...");
  const pastEvent = eventRows["adda-after-dark-standup"];
  const pastTickets = await db.ticket.findMany({ where: { eventId: pastEvent.id }, include: { booking: { select: { userId: true } } } });
  const device = await db.scannerDevice.create({ data: { deviceKey: "demo-device-1", name: "Gate tablet (demo)", userId: scanner.id, eventId: pastEvent.id, organizationId: pastEvent.orgId } });
  const pastStart = daysFromNow(-12, 19, 30).getTime();
  for (const [index, ticket] of pastTickets.entries()) {
    if (index % 5 === 4) continue; // About one in five doesn't turn up.
    const at = new Date(pastStart + between(0, 80) * 60_000);
    await db.ticket.update({ where: { id: ticket.id }, data: { status: "USED", checkedInAt: at } });
    await db.checkIn.create({ data: { ticketId: ticket.id, eventId: pastEvent.id, scannerUserId: scanner.id, deviceId: device.id, gate: index % 3 === 0 ? "Side door" : "Main gate", result: "ACCEPTED", createdAt: at } });
  }
  await db.staffAssignment.createMany({
    data: [
      { eventId: eventRows["spring-campus-carnival"].id, userId: scanner.id, gate: "North gate", assignedById: organizer4.id },
      { eventId: eventRows["neon-monsoon-live-dhaka"].id, userId: scanner.id, gate: "Gate A", assignedById: organizer.id },
      { eventId: pastEvent.id, userId: scanner.id, gate: "Main gate", assignedById: organizer.id },
    ],
  });

  const reviewers = [...new Set(pastTickets.filter((t) => t.status !== "CANCELLED").map((t) => t.booking.userId).filter(Boolean) as string[])].slice(0, 5);
  const COMMENTS = ["Great night, and the entry was quick.", "The comics were brilliant. Would go again!", "Good show, though the venue got warm.", "Scanning at the door took seconds. Loved it.", "Really funny, and a lovely crowd."];
  for (const [index, userId] of reviewers.entries()) {
    await db.review.create({ data: { eventId: pastEvent.id, userId, rating: index === 2 ? 4 : 5, comment: COMMENTS[index] } });
  }

  console.log("Seeding refunds, payouts and notifications...");
  // One refund awaiting an admin decision, using the demo customer's upcoming booking.
  if (featuredForCustomer) {
    const payment = await db.payment.findFirst({ where: { bookingId: featuredForCustomer.id } });
    if (payment) {
      await db.refund.create({ data: { paymentId: payment.id, bookingId: featuredForCustomer.id, amountMinor: payment.amountMinor, reason: "I can no longer attend. (demo request)", requestedById: customer.id } });
    }
  }
  await db.payout.create({ data: { organizationId: orgIds["pulse-live"], amountMinor: 2_500_000, status: "PAID", method: "bKash", accountName: "Pulse Live Bangladesh", accountNumber: "017XXXXXXXX (demo)", reference: "DEMO-PAYOUT-001", requestedById: organizer.id, processedById: admin.id, processedAt: new Date(now - 6 * DAY), createdAt: new Date(now - 8 * DAY) } });
  await db.payout.create({ data: { organizationId: orgIds["pulse-live"], amountMinor: 1_000_000, status: "REQUESTED", method: "bKash", accountName: "Pulse Live Bangladesh", accountNumber: "017XXXXXXXX (demo)", note: "Demo payout awaiting approval", requestedById: organizer.id } });

  await db.notification.createMany({
    data: [
      { userId: customer.id, type: "TICKET", title: "Your tickets are ready", body: "Your tickets for Spring Campus Carnival are in My Tickets.", link: "/my-tickets" },
      { userId: organizer.id, type: "EVENT", title: "Event awaiting approval", body: "Chattogram Indie Music Weekender is in the approval queue." },
      { userId: admin.id, type: "EVENT", title: "Event awaiting approval", body: "Chattogram Indie Music Weekender", link: "/admin/approvals" },
    ],
  });

  for (const [sortOrder, [slug, title, section, body]] of CMS.entries()) {
    await db.cmsPage.create({ data: { slug, title, section, body, sortOrder } });
  }
  for (const [sortOrder, [title, body]] of HELP.entries()) {
    await db.cmsPage.create({ data: { slug: `help-${sortOrder + 1}`, title, body, section: "help", sortOrder } });
  }

  await db.auditLog.create({ data: { actorId: admin.id, action: "seed.complete", entity: "Platform", metadata: { note: "Demo data created" } } });

  const events = await db.event.findMany({ select: { id: true } });
  for (const { id } of events) await db.$transaction((tx) => syncSoldOut(tx, id));

  const [bookingCount, ticketCount] = await Promise.all([db.booking.count(), db.ticket.count()]);
  console.log(`Done: ${EVENTS.length} events, ${customers.length} customers, ${bookingCount} bookings, ${ticketCount} tickets.`);
  console.log("Demo logins (password Demo@12345): admin@tixora.test, organizer@tixora.test, scanner@tixora.test, customer@tixora.test");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
