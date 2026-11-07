import { db, type Tx } from "./db";

export async function audit(
  entry: { actorId?: string | null; action: string; entity: string; entityId?: string | null; metadata?: unknown; ip?: string | null },
  tx: Tx = db,
) {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata === undefined ? undefined : (entry.metadata as never),
      ip: entry.ip ?? null,
    },
  });
}
