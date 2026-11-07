import type { Tx } from "../db";

// Every inventory write is one conditional UPDATE. Postgres takes the row lock and re-evaluates
// the WHERE clause, so concurrent buyers cannot both claim the last seat. The CHECK constraints
// in the integrity migration back this up.

/** Returns false if there is not enough stock. */
export async function reserve(tx: Tx, ticketTypeId: string, quantity: number): Promise<boolean> {
  const count = await tx.$executeRaw`
    UPDATE "TicketInventory"
    SET "reserved" = "reserved" + ${quantity}, "updatedAt" = now()
    WHERE "ticketTypeId" = ${ticketTypeId} AND "total" - "reserved" - "sold" >= ${quantity}`;
  return count === 1;
}

export async function releaseReservation(tx: Tx, ticketTypeId: string, quantity: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE "TicketInventory"
    SET "reserved" = GREATEST("reserved" - ${quantity}, 0), "updatedAt" = now()
    WHERE "ticketTypeId" = ${ticketTypeId}`;
}

/** Converts a held reservation into a sale. Returns false if the hold is missing. */
export async function commitReservation(tx: Tx, ticketTypeId: string, quantity: number): Promise<boolean> {
  const count = await tx.$executeRaw`
    UPDATE "TicketInventory"
    SET "reserved" = "reserved" - ${quantity}, "sold" = "sold" + ${quantity}, "updatedAt" = now()
    WHERE "ticketTypeId" = ${ticketTypeId} AND "reserved" >= ${quantity}`;
  return count === 1;
}

/** Returns sold seats to the pool after a refund or cancellation. */
export async function releaseSold(tx: Tx, ticketTypeId: string, quantity: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE "TicketInventory"
    SET "sold" = GREATEST("sold" - ${quantity}, 0), "updatedAt" = now()
    WHERE "ticketTypeId" = ${ticketTypeId}`;
}

/**
 * Flips an event between PUBLISHED and SOLD_OUT to match seats actually sold.
 * Temporary holds do not count: they may be released, and a held event must stay payable.
 */
export async function syncSoldOut(tx: Tx, eventId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ available: bigint | null }[]>`
    SELECT SUM(i."total" - i."sold") AS available
    FROM "TicketInventory" i
    JOIN "TicketType" t ON t."id" = i."ticketTypeId"
    WHERE t."eventId" = ${eventId} AND t."isActive" = true`;
  const available = Number(rows[0]?.available ?? 0);
  if (available <= 0) {
    await tx.event.updateMany({ where: { id: eventId, status: "PUBLISHED" }, data: { status: "SOLD_OUT" } });
  } else {
    await tx.event.updateMany({ where: { id: eventId, status: "SOLD_OUT" }, data: { status: "PUBLISHED" } });
  }
}
