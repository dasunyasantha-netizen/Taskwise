import { Prisma, InsuranceQuotation } from '@prisma/client'
import { Request, Response } from 'express'
import prisma from '../prisma'

const INSURANCE_TYPES = ['MOTOR', 'FIRE', 'CASUALTY', 'MARINE', 'TRAVEL'] as const
type InsuranceType = typeof INSURANCE_TYPES[number]

const SUBJECT_FIELDS = [
  'vehicleNumber', 'vehicleMakeModel', 'fuelType', 'vehicleUsage',
  'propertyAddress', 'propertyType', 'propertyUsage',
  'riskDescription', 'businessActivity',
  'cargoDescription', 'transitFrom', 'transitTo', 'conveyance',
  'passportNumber', 'destination', 'travelStartDate', 'travelEndDate',
] as const

class InputError extends Error {}

function textValue(value: unknown, label: string, required = true, max = 500): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw new InputError(`${label} is required`)
  if (text.length > max) throw new InputError(`${label} is too long`)
  return text || null
}

function moneyValue(value: unknown, label: string, allowZero = false): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw new InputError(`${label} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`)
  }
  return Math.round(amount * 100) / 100
}

function dateValue(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !value.trim()) throw new InputError(`${label} is required`)
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  if (Number.isNaN(date.getTime())) throw new InputError(`${label} is invalid`)
  return date
}

function insuranceTypeValue(value: unknown): InsuranceType {
  const type = typeof value === 'string' ? value.toUpperCase() : ''
  if (!INSURANCE_TYPES.includes(type as InsuranceType)) throw new InputError('A valid insurance type is required')
  return type as InsuranceType
}

function addCalendarMonthSriLanka(date: Date): Date {
  const offset = 330 * 60 * 1000
  const local = new Date(date.getTime() + offset)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth()
  const day = local.getUTCDate()
  const hour = local.getUTCHours()
  const minute = local.getUTCMinutes()
  const second = local.getUTCSeconds()
  const ms = local.getUTCMilliseconds()
  const lastDayNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate()
  const targetLocal = Date.UTC(year, month + 1, Math.min(day, lastDayNextMonth), hour, minute, second, ms)
  return new Date(targetLocal - offset)
}

function subjectData(body: Record<string, unknown>, type: InsuranceType): Record<string, string | Date | null> {
  const data: Record<string, string | Date | null> = Object.fromEntries(SUBJECT_FIELDS.map(field => [field, null]))

  if (type === 'MOTOR') {
    data.vehicleNumber = textValue(body.vehicleNumber, 'Vehicle number')
    data.vehicleMakeModel = textValue(body.vehicleMakeModel, 'Vehicle make and model')
    data.fuelType = textValue(body.fuelType, 'Fuel type')
    data.vehicleUsage = textValue(body.vehicleUsage, 'Vehicle usage')
  } else if (type === 'FIRE') {
    data.propertyAddress = textValue(body.propertyAddress, 'Property address')
    data.propertyType = textValue(body.propertyType, 'Property type')
    data.propertyUsage = textValue(body.propertyUsage, 'Property usage')
  } else if (type === 'CASUALTY') {
    data.riskDescription = textValue(body.riskDescription, 'Risk or coverage description', true, 1500)
    data.businessActivity = textValue(body.businessActivity, 'Business or occupation')
  } else if (type === 'MARINE') {
    data.cargoDescription = textValue(body.cargoDescription, 'Cargo or subject description', true, 1500)
    data.transitFrom = textValue(body.transitFrom, 'Transit origin')
    data.transitTo = textValue(body.transitTo, 'Transit destination')
    data.conveyance = textValue(body.conveyance, 'Conveyance')
  } else {
    data.passportNumber = textValue(body.passportNumber, 'Passport number')
    data.destination = textValue(body.destination, 'Travel destination')
    const start = dateValue(body.travelStartDate, 'Travel start date')
    const end = dateValue(body.travelEndDate, 'Travel end date')
    if (end < start) throw new InputError('Travel end date must be on or after the start date')
    data.travelStartDate = start
    data.travelEndDate = end
  }

  return data
}

function commonData(body: Record<string, unknown>) {
  const type = insuranceTypeValue(body.insuranceType)
  return {
    insuranceType: type,
    customerName: textValue(body.customerName, 'Customer name', true, 200)!,
    contactNumber: textValue(body.contactNumber, 'Contact number', true, 50)!,
    sumInsured: moneyValue(body.sumInsured, 'Sum insured'),
    premium: moneyValue(body.premium, 'Premium'),
    notes: textValue(body.notes, 'Notes', false, 3000),
    ...subjectData(body, type),
  }
}

function paymentData(body: Record<string, unknown>, premium: number) {
  const paidRequested = body.paid === true
  let paymentAmount = body.paymentAmount === '' || body.paymentAmount == null
    ? 0
    : moneyValue(body.paymentAmount, 'Payment amount', true)
  if (paidRequested) paymentAmount = premium
  if (paymentAmount > premium) throw new InputError('Payment amount cannot exceed the policy premium')
  return {
    paid: paidRequested || paymentAmount === premium,
    paymentAmount,
    paymentUpdatedAt: paymentAmount > 0 || paidRequested ? new Date() : null,
  }
}

async function actorName(req: Request): Promise<string> {
  const { actorId, actorType } = req.user!
  if (actorType === 'director') {
    return (await prisma.director.findUnique({ where: { id: actorId }, select: { name: true } }))?.name || 'Director'
  }
  return (await prisma.personnel.findUnique({ where: { id: actorId }, select: { name: true } }))?.name || 'Personnel'
}

async function audit(req: Request, event: string, payload: Record<string, unknown>) {
  const { actorId, actorType, workspaceId, adminId, adminName, impersonationSessionId } = req.user!
  const impersonated = !!adminId
  await prisma.auditLog.create({
    data: {
      workspaceId,
      event,
      actorType: impersonated ? 'director' : actorType,
      actorDirectorId: impersonated ? adminId : actorType === 'director' ? actorId : undefined,
      actorPersonnelId: impersonated ? undefined : actorType === 'personnel' ? actorId : undefined,
      payload: {
        ...payload,
        ...(impersonated ? { _impersonatedBy: adminName || adminId, _impersonationSessionId: impersonationSessionId } : {}),
      } as Prisma.InputJsonObject,
    },
  })
}

async function expireQuotations(workspaceId: string) {
  await prisma.insuranceQuotation.updateMany({
    where: { workspaceId, status: 'ACTIVE', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  })
}

function decimalNumber(value: Prisma.Decimal): number { return Number(value) }

function quotationJson<T extends { sumInsured: Prisma.Decimal; premium: Prisma.Decimal }>(row: T) {
  return { ...row, sumInsured: decimalNumber(row.sumInsured), premium: decimalNumber(row.premium) }
}

function policyJson<T extends { sumInsured: Prisma.Decimal; premium: Prisma.Decimal; paymentAmount: Prisma.Decimal }>(row: T) {
  const premium = decimalNumber(row.premium)
  const paymentAmount = decimalNumber(row.paymentAmount)
  return {
    ...row,
    sumInsured: decimalNumber(row.sumInsured),
    premium,
    paymentAmount,
    remainingAmount: Math.max(0, Math.round((premium - paymentAmount) * 100) / 100),
  }
}

function quotationSearch(q: string): Prisma.InsuranceQuotationWhereInput[] {
  return [
    'quotationNumber', 'customerName', 'contactNumber', 'vehicleNumber', 'vehicleMakeModel',
    'propertyAddress', 'riskDescription', 'businessActivity', 'cargoDescription',
    'transitFrom', 'transitTo', 'passportNumber', 'destination',
  ].map(field => ({ [field]: { contains: q, mode: 'insensitive' } })) as Prisma.InsuranceQuotationWhereInput[]
}

function policySearch(q: string): Prisma.InsurancePolicyWhereInput[] {
  return [
    'policyNumber', 'customerName', 'contactNumber', 'vehicleNumber', 'vehicleMakeModel',
    'propertyAddress', 'riskDescription', 'businessActivity', 'cargoDescription',
    'transitFrom', 'transitTo', 'passportNumber', 'destination',
  ].map(field => ({ [field]: { contains: q, mode: 'insensitive' } })) as Prisma.InsurancePolicyWhereInput[]
}

function handleError(err: unknown, res: Response) {
  if (err instanceof InputError) { res.status(400).json({ error: err.message }); return }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ error: 'That quotation or policy number is already in use' }); return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}

export async function getInsuranceSummary(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    await expireQuotations(workspaceId)
    const [quotations, policies] = await Promise.all([
      prisma.insuranceQuotation.findMany({ where: { workspaceId }, select: { status: true, premium: true } }),
      prisma.insurancePolicy.findMany({ where: { workspaceId }, select: { premium: true, paymentAmount: true, paid: true, expiryDate: true } }),
    ])
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const totalPolicyPremium = policies.reduce((sum, policy) => sum + Number(policy.premium), 0)
    const totalPayments = policies.reduce((sum, policy) => sum + Number(policy.paymentAmount), 0)
    res.json({
      activeQuotations: quotations.filter(q => q.status === 'ACTIVE').length,
      expiredQuotations: quotations.filter(q => q.status === 'EXPIRED').length,
      convertedQuotations: quotations.filter(q => q.status === 'CONVERTED').length,
      completedPolicies: policies.length,
      unpaidPolicies: policies.filter(p => !p.paid).length,
      expiringPolicies: policies.filter(p => p.expiryDate >= now && p.expiryDate <= in30Days).length,
      totalPolicyPremium: Math.round(totalPolicyPremium * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      outstandingAmount: Math.max(0, Math.round((totalPolicyPremium - totalPayments) * 100) / 100),
    })
  } catch (err) { handleError(err, res) }
}

export async function listQuotations(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    await expireQuotations(workspaceId)
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const type = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : ''
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : ''
    const where: Prisma.InsuranceQuotationWhereInput = {
      workspaceId,
      ...(q ? { OR: quotationSearch(q) } : {}),
      ...(INSURANCE_TYPES.includes(type as InsuranceType) ? { insuranceType: type } : {}),
      ...(status ? { status } : {}),
    }
    const rows = await prisma.insuranceQuotation.findMany({
      where,
      include: { convertedPolicy: { select: { id: true, policyNumber: true } }, renewedTo: { select: { id: true, quotationNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })
    res.json(rows.map(quotationJson))
  } catch (err) { handleError(err, res) }
}

export async function getQuotation(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    await expireQuotations(workspaceId)
    const row = await prisma.insuranceQuotation.findFirst({
      where: { id: req.params.id, workspaceId },
      include: { convertedPolicy: true, renewedFrom: { select: { id: true, quotationNumber: true } }, renewedTo: { select: { id: true, quotationNumber: true } } },
    })
    if (!row) { res.status(404).json({ error: 'Quotation not found' }); return }
    res.json(quotationJson(row))
  } catch (err) { handleError(err, res) }
}

export async function createQuotation(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>
    const quotationNumber = textValue(body.quotationNumber, 'Quotation number', true, 100)!
    const data = commonData(body)
    const issueDate = new Date()
    const name = await actorName(req)
    const row = await prisma.insuranceQuotation.create({
      data: {
        workspaceId: req.user!.workspaceId,
        quotationNumber,
        ...data,
        issueDate,
        expiresAt: addCalendarMonthSriLanka(issueDate),
        createdById: req.user!.actorId,
        createdByType: req.user!.actorType,
        createdByName: name,
      },
    })
    await audit(req, 'INSURANCE_QUOTATION_CREATED', { quotationId: row.id, quotationNumber, customerName: row.customerName })
    res.status(201).json(quotationJson(row))
  } catch (err) { handleError(err, res) }
}

export async function updateQuotation(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    await expireQuotations(workspaceId)
    const existing = await prisma.insuranceQuotation.findFirst({ where: { id: req.params.id, workspaceId } })
    if (!existing) { res.status(404).json({ error: 'Quotation not found' }); return }
    if (existing.status !== 'ACTIVE') { res.status(409).json({ error: 'Only active quotations can be edited' }); return }
    const body = req.body as Record<string, unknown>
    const quotationNumber = textValue(body.quotationNumber, 'Quotation number', true, 100)!
    const name = await actorName(req)
    const row = await prisma.insuranceQuotation.update({
      where: { id: existing.id },
      data: {
        quotationNumber,
        ...commonData(body),
        updatedById: req.user!.actorId,
        updatedByType: req.user!.actorType,
        updatedByName: name,
      },
    })
    await audit(req, 'INSURANCE_QUOTATION_UPDATED', { quotationId: row.id, quotationNumber, customerName: row.customerName })
    res.json(quotationJson(row))
  } catch (err) { handleError(err, res) }
}

function copiedSubjectData(quotation: InsuranceQuotation) {
  return Object.fromEntries(SUBJECT_FIELDS.map(field => [field, quotation[field]]))
}

export async function convertQuotation(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    await expireQuotations(workspaceId)
    const quotation = await prisma.insuranceQuotation.findFirst({ where: { id: req.params.id, workspaceId } })
    if (!quotation) { res.status(404).json({ error: 'Quotation not found' }); return }
    if (quotation.status !== 'ACTIVE') { res.status(409).json({ error: 'Only active quotations can be converted' }); return }
    const body = req.body as Record<string, unknown>
    const policyNumber = textValue(body.policyNumber, 'Policy number', true, 100)!
    const premium = moneyValue(body.premium, 'Premium')
    const issueDate = dateValue(body.issueDate, 'Issue date')
    const expiryDate = dateValue(body.expiryDate, 'Expiry date')
    if (expiryDate < issueDate) throw new InputError('Expiry date must be on or after the issue date')
    const payment = paymentData(body, premium)
    const name = await actorName(req)
    const policy = await prisma.$transaction(async tx => {
      const created = await tx.insurancePolicy.create({
        data: {
          workspaceId,
          policyNumber,
          insuranceType: quotation.insuranceType,
          customerName: quotation.customerName,
          contactNumber: quotation.contactNumber,
          sumInsured: quotation.sumInsured,
          premium,
          issueDate,
          expiryDate,
          notes: quotation.notes,
          ...copiedSubjectData(quotation),
          ...payment,
          sourceQuotationId: quotation.id,
          createdById: req.user!.actorId,
          createdByType: req.user!.actorType,
          createdByName: name,
        },
      })
      await tx.insuranceQuotation.update({ where: { id: quotation.id }, data: { status: 'CONVERTED' } })
      return created
    })
    await audit(req, 'INSURANCE_QUOTATION_CONVERTED', { quotationId: quotation.id, quotationNumber: quotation.quotationNumber, policyId: policy.id, policyNumber })
    res.status(201).json(policyJson(policy))
  } catch (err) { handleError(err, res) }
}

export async function renewQuotation(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    await expireQuotations(workspaceId)
    const quotation = await prisma.insuranceQuotation.findFirst({ where: { id: req.params.id, workspaceId } })
    if (!quotation) { res.status(404).json({ error: 'Quotation not found' }); return }
    if (quotation.status !== 'EXPIRED') { res.status(409).json({ error: 'Only expired quotations can be renewed' }); return }
    const body = req.body as Record<string, unknown>
    const quotationNumber = textValue(body.quotationNumber, 'New quotation number', true, 100)!
    const premium = body.premium == null || body.premium === '' ? Number(quotation.premium) : moneyValue(body.premium, 'Premium')
    const issueDate = new Date()
    const name = await actorName(req)
    const renewed = await prisma.$transaction(async tx => {
      const created = await tx.insuranceQuotation.create({
        data: {
          workspaceId,
          quotationNumber,
          insuranceType: quotation.insuranceType,
          customerName: quotation.customerName,
          contactNumber: quotation.contactNumber,
          sumInsured: quotation.sumInsured,
          premium,
          issueDate,
          expiresAt: addCalendarMonthSriLanka(issueDate),
          notes: quotation.notes,
          ...copiedSubjectData(quotation),
          renewedFromId: quotation.id,
          createdById: req.user!.actorId,
          createdByType: req.user!.actorType,
          createdByName: name,
        },
      })
      await tx.insuranceQuotation.update({ where: { id: quotation.id }, data: { status: 'RENEWED' } })
      return created
    })
    await audit(req, 'INSURANCE_QUOTATION_RENEWED', { previousQuotationId: quotation.id, previousQuotationNumber: quotation.quotationNumber, quotationId: renewed.id, quotationNumber })
    res.status(201).json(quotationJson(renewed))
  } catch (err) { handleError(err, res) }
}

export async function listPolicies(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const type = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : ''
    const payment = typeof req.query.payment === 'string' ? req.query.payment.toUpperCase() : ''
    const where: Prisma.InsurancePolicyWhereInput = {
      workspaceId,
      ...(q ? { OR: policySearch(q) } : {}),
      ...(INSURANCE_TYPES.includes(type as InsuranceType) ? { insuranceType: type } : {}),
      ...(payment === 'PAID' ? { paid: true } : payment === 'OUTSTANDING' ? { paid: false } : {}),
    }
    const rows = await prisma.insurancePolicy.findMany({
      where,
      include: { sourceQuotation: { select: { id: true, quotationNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    })
    res.json(rows.map(policyJson))
  } catch (err) { handleError(err, res) }
}

export async function getPolicy(req: Request, res: Response): Promise<void> {
  try {
    const row = await prisma.insurancePolicy.findFirst({
      where: { id: req.params.id, workspaceId: req.user!.workspaceId },
      include: { sourceQuotation: { select: { id: true, quotationNumber: true } } },
    })
    if (!row) { res.status(404).json({ error: 'Policy not found' }); return }
    res.json(policyJson(row))
  } catch (err) { handleError(err, res) }
}

export async function createPolicy(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>
    const policyNumber = textValue(body.policyNumber, 'Policy number', true, 100)!
    const data = commonData(body)
    const issueDate = dateValue(body.issueDate, 'Issue date')
    const expiryDate = dateValue(body.expiryDate, 'Expiry date')
    if (expiryDate < issueDate) throw new InputError('Expiry date must be on or after the issue date')
    const payment = paymentData(body, data.premium)
    const name = await actorName(req)
    const row = await prisma.insurancePolicy.create({
      data: {
        workspaceId: req.user!.workspaceId,
        policyNumber,
        ...data,
        issueDate,
        expiryDate,
        ...payment,
        createdById: req.user!.actorId,
        createdByType: req.user!.actorType,
        createdByName: name,
      },
    })
    await audit(req, 'INSURANCE_POLICY_CREATED', { policyId: row.id, policyNumber, customerName: row.customerName })
    res.status(201).json(policyJson(row))
  } catch (err) { handleError(err, res) }
}

export async function updatePolicy(req: Request, res: Response): Promise<void> {
  try {
    const { workspaceId } = req.user!
    const existing = await prisma.insurancePolicy.findFirst({ where: { id: req.params.id, workspaceId } })
    if (!existing) { res.status(404).json({ error: 'Policy not found' }); return }
    const body = req.body as Record<string, unknown>
    const policyNumber = textValue(body.policyNumber, 'Policy number', true, 100)!
    const data = commonData(body)
    const issueDate = dateValue(body.issueDate, 'Issue date')
    const expiryDate = dateValue(body.expiryDate, 'Expiry date')
    if (expiryDate < issueDate) throw new InputError('Expiry date must be on or after the issue date')
    const payment = paymentData(body, data.premium)
    const name = await actorName(req)
    const row = await prisma.insurancePolicy.update({
      where: { id: existing.id },
      data: {
        policyNumber,
        ...data,
        issueDate,
        expiryDate,
        ...payment,
        updatedById: req.user!.actorId,
        updatedByType: req.user!.actorType,
        updatedByName: name,
      },
    })
    await audit(req, 'INSURANCE_POLICY_UPDATED', { policyId: row.id, policyNumber, customerName: row.customerName, paymentAmount: Number(row.paymentAmount), paid: row.paid })
    res.json(policyJson(row))
  } catch (err) { handleError(err, res) }
}
