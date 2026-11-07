// Creates a super admin, or promotes an existing user. Safe to use in production.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' ADMIN_NAME='Your Name' npm run admin:create
import "dotenv/config";
import { db } from "../src/server/db";
import { hashPassword } from "../src/server/auth/password";
import { passwordSchema } from "../src/lib/validation";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD.");
  passwordSchema.parse(password);

  const role = await db.role.upsert({
    where: { key: "SUPER_ADMIN" },
    update: {},
    create: { key: "SUPER_ADMIN", name: "Super admin", description: "Complete platform control." },
  });
  // Roles a brand new production database needs for everyone else.
  for (const [key, name] of [["CUSTOMER", "Customer"], ["ORGANIZER", "Organizer"], ["SCANNER", "Scanner / Event staff"]] as const) {
    await db.role.upsert({ where: { key }, update: {}, create: { key, name } });
  }
  const user = await db.user.upsert({
    where: { email },
    update: { roleId: role.id, passwordHash: await hashPassword(password), status: "ACTIVE", sessionVersion: { increment: 1 } },
    create: { email, name: process.env.ADMIN_NAME ?? "Administrator", passwordHash: await hashPassword(password), roleId: role.id, emailVerifiedAt: new Date() },
  });
  console.log(`Super admin ready: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
