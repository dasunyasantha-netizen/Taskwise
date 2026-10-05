import { PrismaClient } from '@prisma/client'
import { requestContext } from './helpers/requestContext'

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

// Record which person acted when a shared Chairman role has several holders.
prisma.$use(async (params, next) => {
  const holderName = requestContext.getStore()?.holderName
  if (holderName && params.model === 'AuditLog') {
    if (params.action === 'create') params.args.data = { actorHolderName: holderName, ...params.args.data }
    if (params.action === 'createMany' && Array.isArray(params.args.data)) params.args.data = params.args.data.map((d: object) => ({ actorHolderName: holderName, ...d }))
  }
  return next(params)
})

export default prisma
