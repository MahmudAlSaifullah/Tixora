import bcrypt from "bcryptjs";

const COST = 12;
// A valid hash of a random value, compared against when the account does not exist.
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8H1pYQ1r3F0G1vZ9mJ8qk0iJ2oE2nK";

export const hashPassword = (password: string) => bcrypt.hash(password, COST);

export async function verifyPassword(password: string, hash?: string | null): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}
