import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import prisma from '../prisma'
import { normalizeEmail, normalizeSriLankanPhone, makeLoginId } from '../helpers/phone'
import { suggestAvailablePrefix, validateCompanyPrefix } from '../helpers/prefix'
import { checkPublicThrottle } from '../helpers/publicThrottle'

const PUBLIC_STATUSES = ['PENDING', 'MORE_INFORMATION_REQUIRED', 'APPROVED', 'REJECTED']
const DOC_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg'])
const SYSTEM_EVENTS_WORKSPACE = 'system'

function clean(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max)
}

function requestReference(): string {
  const y = new Date().getFullYear()
  return `CR-${y}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function prefixTaken(prefix: string, exceptCompanyId?: string | null): Promise<boolean> {
  const existing = await prisma.company.findFirst({
    where: {
      prefix: { equals: prefix, mode: 'insensitive' },
      ...(exceptCompanyId ? { NOT: { id: exceptCompanyId } } : {}),
    },
    select: { id: true },
  })
  return !!existing
}

function safeRequest(r: {
  id: string; reference: string; status: string; legalName: string; displayName: string | null;
  registrationNumber: string; applicantName: string; applicantPhone: string; applicantEmail: string;
  suggestedPrefix: string; finalPrefix: string | null; createdAt: Date; updatedAt: Date;
  moreInfoInstructions?: string | null; rejectionReason?: string | null;
}) {
  return {
    id: r.id,
    reference: r.reference,
    status: r.status,
    legalName: r.legalName,
    displayName: r.displayName,
    registrationNumber: r.registrationNumber,
    applicantName: r.applicantName,
    applicantPhone: r.applicantPhone,
    applicantEmail: r.applicantEmail,
    suggestedPrefix: r.suggestedPrefix,
    finalPrefix: r.finalPrefix,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    moreInfoInstructions: r.moreInfoInstructions,
    rejectionReason: r.rejectionReason,
  }
}

export async function createCompanyRequest(req: Request, res: Response): Promise<void> {
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown'
    if (!checkPublicThrottle(`company-request:${ip}`, 5, 60 * 60 * 1000)) {
      res.status(429).json({ error: 'Too many requests. Please try again later.' })
      return
    }

    const company = req.body.company || {}
    const applicant = req.body.applicant || {}
    const legalName = clean(company.legalName, 160)
    const registrationNumber = clean(company.registrationNumber, 80).toUpperCase()
    const address = clean(company.address, 1000)
    const industry = clean(company.industry, 120)
    const reason = clean(company.reason, 2000)
    const firstName = clean(applicant.firstName, 80)
    const middleName = clean(applicant.middleName, 80)
    const lastName = clean(applicant.lastName, 80)
    const email = normalizeEmail(applicant.email)
    const password = String(applicant.password || '')
    const confirmPassword = String(applicant.confirmPassword || '')

    if (!legalName || !registrationNumber || !address || !industry || !reason || !firstName || !lastName || !email || !password) {
      res.status(400).json({ error: 'Required fields are missing' })
      return
    }
    if (password.length < 8 || password !== confirmPassword) {
      res.status(400).json({ error: 'Password requirements are not met' })
      return
    }

    let phone
    try { phone = normalizeSriLankanPhone(applicant.phone) }
    catch (e) { res.status(400).json({ error: (e as Error).message }); return }

    const doc = company.supportingDocument
    if (doc) {
      const name = clean(doc.name, 180)
      const mime = clean(doc.mimeType, 80)
      const data = String(doc.data || '')
      if (!name || !DOC_MIME.has(mime) || !data.startsWith('data:')) {
        res.status(400).json({ error: 'Invalid supporting document' })
        return
      }
      if (data.length > 2_800_000) {
        res.status(400).json({ error: 'Supporting document is too large' })
        return
      }
    }

    const duplicate = await prisma.companyRequest.findFirst({
      where: {
        status: { in: ['PENDING', 'MORE_INFORMATION_REQUIRED'] },
        OR: [
          { registrationNumber },
          { applicantNormalizedPhone: phone.canonical },
          { applicantEmail: email },
        ],
      },
      select: { reference: true, status: true },
    })
    if (duplicate) {
      res.status(409).json({ error: 'A pending company request already exists for these details' })
      return
    }

    const suggestedPrefix = await suggestAvailablePrefix(legalName, p => prefixTaken(p))
    const publicToken = crypto.randomBytes(24).toString('base64url')
    const hashedPassword = await bcrypt.hash(password, 12)
    const applicantName = [firstName, middleName, lastName].filter(Boolean).join(' ')

    const request = await prisma.$transaction(async tx => {
      const created = await tx.companyRequest.create({
        data: {
          reference: requestReference(),
          legalName,
          displayName: clean(company.displayName, 160) || null,
          registrationNumber,
          address,
          industry,
          website: clean(company.website, 240) || null,
          expectedUsers: company.expectedUsers ? Number(company.expectedUsers) : null,
          reason,
          supportingDocumentName: doc ? clean(doc.name, 180).replace(/[^\w.\- ]/g, '_') : null,
          supportingDocumentMime: doc ? clean(doc.mimeType, 80) : null,
          supportingDocumentData: doc ? String(doc.data) : null,
          applicantFirstName: firstName,
          applicantMiddleName: middleName || null,
          applicantLastName: lastName,
          applicantName,
          applicantPhone: phone.local,
          applicantNormalizedPhone: phone.canonical,
          applicantEmail: email,
          applicantPasswordHash: hashedPassword,
          suggestedPrefix,
          publicStatusTokenHash: tokenHash(publicToken),
        },
      })
      await tx.companyRequestAction.create({
        data: { requestId: created.id, action: 'COMPANY_REQUEST_SUBMITTED', metadata: { ipAddress: ip } },
      })
      await tx.auditLog.create({
        data: {
          workspaceId: SYSTEM_EVENTS_WORKSPACE,
          event: 'COMPANY_REQUEST_SUBMITTED',
          actorType: 'public',
          payload: { reference: created.reference, registrationNumber },
        },
      })
      const admins = await tx.director.findMany({ where: { isSyswiseAdmin: true, isActive: true }, select: { id: true, workspaceId: true } })
      await Promise.all(admins.filter(a => a.workspaceId).map(a => tx.notification.create({
        data: {
          workspaceId: a.workspaceId!,
          recipientDirectorId: a.id,
          recipientType: 'director',
          type: 'company_request_submitted',
          title: 'New company request',
          message: `${legalName} submitted a Syswise access request.`,
          payload: { reference: created.reference },
        },
      })))
      return created
    })

    res.status(201).json({
      reference: request.reference,
      status: request.status,
      statusToken: publicToken,
      message: 'Your request has been submitted. Syswise approval is required before any company or administrator account is activated.',
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getCompanyRequestStatus(req: Request, res: Response): Promise<void> {
  try {
    const reference = clean(req.body.reference, 80)
    const statusToken = String(req.body.statusToken || '')
    const phoneOrEmail = clean(req.body.phoneOrEmail, 160)
    const request = await prisma.companyRequest.findUnique({ where: { reference } })
    if (!request) { res.status(404).json({ error: 'Request not found' }); return }

    let verified = false
    if (statusToken && tokenHash(statusToken) === request.publicStatusTokenHash) verified = true
    if (!verified && phoneOrEmail) {
      const email = phoneOrEmail.includes('@') ? normalizeEmail(phoneOrEmail) : ''
      let phone = ''
      try { phone = normalizeSriLankanPhone(phoneOrEmail).canonical } catch {}
      verified = email === request.applicantEmail || phone === request.applicantNormalizedPhone
    }
    if (!verified) { res.status(403).json({ error: 'Unable to verify request access' }); return }

    res.json({
      reference: request.reference,
      status: PUBLIC_STATUSES.includes(request.status) ? request.status : 'PENDING',
      moreInfoInstructions: request.status === 'MORE_INFORMATION_REQUIRED' ? request.moreInfoInstructions : undefined,
      rejectionReason: request.status === 'REJECTED' ? request.rejectionReason : undefined,
      suggestedPrefix: request.status === 'APPROVED' ? (request.finalPrefix || request.suggestedPrefix) : undefined,
    })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

export async function resubmitCompanyRequest(req: Request, res: Response): Promise<void> {
  try {
    const reference = clean(req.body.reference, 80)
    const statusToken = String(req.body.statusToken || '')
    const additionalInfo = clean(req.body.additionalInfo, 2000)
    const request = await prisma.companyRequest.findUnique({ where: { reference } })
    if (!request || tokenHash(statusToken) !== request.publicStatusTokenHash) {
      res.status(403).json({ error: 'Unable to verify request access' }); return
    }
    if (request.status !== 'MORE_INFORMATION_REQUIRED') {
      res.status(400).json({ error: 'This request cannot be resubmitted' }); return
    }
    await prisma.$transaction(async tx => {
      await tx.companyRequest.update({ where: { id: request.id }, data: { status: 'PENDING', moreInfoInstructions: null, reason: `${request.reason}\n\nApplicant update:\n${additionalInfo}` } })
      await tx.companyRequestAction.create({ data: { requestId: request.id, action: 'COMPANY_REQUEST_RESUBMITTED', note: additionalInfo } })
    })
    res.json({ success: true, status: 'PENDING' })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

export async function listCompanyRequests(req: Request, res: Response): Promise<void> {
  try {
    const { status, q, reference, from, to } = req.query as Record<string, string>
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (reference) where.reference = { contains: reference, mode: 'insensitive' }
    if (q) where.OR = [
      { legalName: { contains: q, mode: 'insensitive' } },
      { displayName: { contains: q, mode: 'insensitive' } },
      { registrationNumber: { contains: q, mode: 'insensitive' } },
      { applicantName: { contains: q, mode: 'insensitive' } },
    ]
    if (from || to) where.createdAt = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }
    const [pendingCount, requests] = await Promise.all([
      prisma.companyRequest.count({ where: { status: 'PENDING' } }),
      prisma.companyRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        take: 200,
      }),
    ])
    res.json({ pendingCount, requests: requests.map(safeRequest) })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

export async function getCompanyRequest(req: Request, res: Response): Promise<void> {
  try {
    const request = await prisma.companyRequest.findUnique({
      where: { id: req.params.id },
      include: { actions: { orderBy: { createdAt: 'desc' }, include: { actorDirector: { select: { name: true } } } } },
    })
    if (!request) { res.status(404).json({ error: 'Request not found' }); return }
    const { applicantPasswordHash: _hash, publicStatusTokenHash: _token, supportingDocumentData, ...safe } = request
    res.json({ ...safe, hasSupportingDocument: !!supportingDocumentData })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

export async function downloadCompanyRequestDocument(req: Request, res: Response): Promise<void> {
  try {
    const request = await prisma.companyRequest.findUnique({ where: { id: req.params.id } })
    if (!request?.supportingDocumentData || !request.supportingDocumentMime) {
      res.status(404).json({ error: 'Document not found' }); return
    }
    res.json({ name: request.supportingDocumentName, mimeType: request.supportingDocumentMime, data: request.supportingDocumentData })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }) }
}

async function addAdminAction(requestId: string, actorId: string, action: string, note?: string, metadata?: object) {
  await prisma.companyRequestAction.create({ data: { requestId, actorDirectorId: actorId, action, note, metadata } })
}

export async function updateCompanyRequestStatus(req: Request, res: Response): Promise<void> {
  try {
    const { actorId, workspaceId } = req.user!
    const { action, reason, instructions, note, prefix } = req.body
    const request = await prisma.companyRequest.findUnique({ where: { id: req.params.id } })
    if (!request) { res.status(404).json({ error: 'Request not found' }); return }

    if (action === 'reject' && !clean(reason, 1000)) { res.status(400).json({ error: 'Reason is required' }); return }
    if (action === 'more_info' && !clean(instructions, 1500)) { res.status(400).json({ error: 'Instructions are required' }); return }

    if (action === 'approve') {
      const approved = await approveRequestTransaction(request.id, actorId, clean(prefix, 10) || request.finalPrefix || request.suggestedPrefix)
      res.json(approved)
      return
    }

    const data: Record<string, unknown> = {}
    let event = 'COMPANY_REQUEST_REVIEWED'
    if (action === 'reject') {
      data.status = 'REJECTED'; data.rejectionReason = clean(reason, 1000); event = 'COMPANY_REQUEST_REJECTED'
    } else if (action === 'more_info') {
      data.status = 'MORE_INFORMATION_REQUIRED'; data.moreInfoInstructions = clean(instructions, 1500); event = 'COMPANY_REQUEST_MORE_INFORMATION_REQUESTED'
    } else if (action === 'pending') {
      data.status = 'PENDING'; data.moreInfoInstructions = null; data.rejectionReason = null; event = 'COMPANY_REQUEST_RETURNED_TO_PENDING'
    } else if (action === 'note') {
      data.internalNote = clean(note, 2000); event = 'COMPANY_REQUEST_INTERNAL_NOTE_ADDED'
    } else if (action === 'prefix') {
      data.finalPrefix = validateCompanyPrefix(prefix); event = 'COMPANY_REQUEST_PREFIX_CHANGED'
    } else {
      res.status(400).json({ error: 'Invalid action' }); return
    }

    const updated = await prisma.$transaction(async tx => {
      const r = await tx.companyRequest.update({ where: { id: request.id }, data })
      await tx.companyRequestAction.create({ data: { requestId: request.id, actorDirectorId: actorId, action: event, note: clean(reason || instructions || note, 2000) || null, metadata: prefix ? { prefix: String(data.finalPrefix) } : undefined } })
      await tx.auditLog.create({ data: { workspaceId, event, actorDirectorId: actorId, actorType: 'director', payload: { requestId: request.id, reference: request.reference } } })
      return r
    })
    res.json(safeRequest(updated))
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to update request' })
  }
}

async function approveRequestTransaction(requestId: string, actorId: string, rawPrefix: string) {
  return prisma.$transaction(async tx => {
    const request = await tx.companyRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new Error('Request not found')
    if (request.status === 'APPROVED' && request.companyId && request.administratorDirectorId) {
      return { success: true, companyId: request.companyId, administratorDirectorId: request.administratorDirectorId, alreadyApproved: true }
    }
    if (!['PENDING', 'MORE_INFORMATION_REQUIRED'].includes(request.status)) {
      throw new Error('Request is not eligible for approval')
    }
    const prefix = validateCompanyPrefix(rawPrefix)
    const taken = await tx.company.findFirst({ where: { prefix: { equals: prefix, mode: 'insensitive' } }, select: { id: true } })
    if (taken) throw new Error('Selected prefix is no longer available')

    const workspace = await tx.workspace.create({
      data: { name: request.displayName || request.legalName, companyName: request.displayName || request.legalName },
    })
    await tx.layer.createMany({
      data: [
        { workspaceId: workspace.id, number: 1, name: 'Layer 1' },
        { workspaceId: workspace.id, number: 2, name: 'Layer 2' },
        { workspaceId: workspace.id, number: 3, name: 'Layer 3' },
      ],
    })
    const company = await tx.company.create({
      data: {
        legalName: request.legalName,
        displayName: request.displayName,
        registrationNumber: request.registrationNumber,
        prefix,
        status: 'ACTIVE',
        workspaceId: workspace.id,
        createdFromRequestId: request.id,
      },
    })
    await tx.workspace.update({ where: { id: workspace.id }, data: { companyId: company.id } })
    const loginId = makeLoginId(prefix, request.applicantPhone)
    const admin = await tx.director.create({
      data: {
        name: request.applicantName,
        email: request.applicantEmail,
        phone: request.applicantPhone,
        normalizedPhone: request.applicantNormalizedPhone,
        loginId,
        password: request.applicantPasswordHash,
        workspaceId: workspace.id,
        companyId: company.id,
        isCompanyAdmin: true,
        isActive: true,
      },
    })
    await tx.companyRequest.update({
      where: { id: request.id },
      data: {
        status: 'APPROVED',
        finalPrefix: prefix,
        approvedByDirectorId: actorId,
        approvedAt: new Date(),
        companyId: company.id,
        administratorDirectorId: admin.id,
      },
    })
    await tx.companyRequestAction.create({ data: { requestId: request.id, actorDirectorId: actorId, action: 'COMPANY_REQUEST_APPROVED', metadata: { companyId: company.id, administratorDirectorId: admin.id, prefix, loginId } } })
    await tx.auditLog.create({ data: { workspaceId: workspace.id, event: 'COMPANY_ADMINISTRATOR_CREATED', actorDirectorId: actorId, actorType: 'director', payload: { companyId: company.id, administratorDirectorId: admin.id } } })
    return { success: true, companyId: company.id, administratorDirectorId: admin.id, prefix, loginId }
  })
}
