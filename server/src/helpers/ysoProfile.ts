import { Prisma, PrismaClient } from '@prisma/client'
import { localDate } from './ysoRules'

/**
 * Turns on YSO reporting for a personnel record that is (now) a Level-4 YSO
 * and has no reporting profile yet, starting today (their joining date).
 * Idempotent; existing profiles and start dates are never changed.
 */
export async function ensureYsoProfile(
  db: Prisma.TransactionClient | PrismaClient,
  personnelId: string
) {
  const person = await db.personnel.findUnique({
    where: { id: personnelId },
    include: { department: { include: { layer: true } }, ysoProfile: true },
  })
  if (
    !person ||
    person.ysoProfile ||
    person.deletedAt ||
    !person.workspaceId ||
    person.department.layer.number !== 4 ||
    person.department.name.toUpperCase() !== 'YSO'
  )
    return
  const startDate = localDate()
  await db.ysoProfile.create({
    data: { workspaceId: person.workspaceId, personnelId: person.id, startDate },
  })
  await db.ysoAuditEvent.create({
    data: {
      workspaceId: person.workspaceId,
      personnelId: person.id,
      actorId: 'system:auto-activation',
      event: 'REPORTING_ACTIVATED',
      data: { startDate, automatic: true },
    },
  })
}
