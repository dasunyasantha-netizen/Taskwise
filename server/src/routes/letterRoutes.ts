import express, { Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { Prisma } from '@prisma/client'
import prisma from '../prisma'
import { authenticateToken } from '../middleware/authMiddleware'
import {
  LetterError,
  ensure,
  scope,
  visibility,
  memberByKey,
  notify,
  text,
  date,
  today,
  days,
  files,
  sha,
  encrypt,
  encryptionReady,
} from '../helpers/letters'
import {
  oauth,
  callbackUrl,
  verifyFolder,
  managedClient,
  driveScope,
  ensureFolder,
} from '../helpers/letterDrive'
const router = express.Router()
const safe =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req, res)
    } catch (error: any) {
      res
        .status(
          error instanceof LetterError
            ? error.status
            : error.code === 'P2002'
              ? 409
              : 500
        )
        .json({
          error:
            error instanceof LetterError
              ? error.message
              : error.code === 'P2002'
                ? 'This action already exists. Refresh the thread.'
                : 'The letter operation could not be completed. Please retry.',
        })
    }
  }
const attachmentSelect = {
  id: true,
  name: true,
  mime: true,
  size: true,
  sha256: true,
  uploadState: true,
  uploadError: true,
  previewState: true,
  previewError: true,
  pageCount: true,
  previews: { select: { page: true }, orderBy: { page: 'asc' as const } },
}
const lock = async (db: Prisma.TransactionClient, id: string) => {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`letters:${id}`}))`
}
const requestId = (value: unknown) => {
  const id = text(value, 'Request identifier', 80)
  ensure(/^[a-zA-Z0-9_-]{16,80}$/.test(id), 400, 'Invalid request identifier')
  return id
}
const publicSettings = (c: any) => ({
  folderId: c?.folderId || '',
  clientId: c?.clientId || '',
  hasClientSecret: !!c?.encryptedSecret,
  connected: !!c?.connected,
  entryDelayDays: c?.entryDelayDays ?? 2,
  assigneeDays: c?.assigneeDays ?? 7,
  encryptionReady: encryptionReady(),
  callbackUrl: callbackUrl(),
  managed: !!managedClient(),
})

router.get(
  '/drive/callback',
  safe(async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer').set('Cache-Control', 'no-store')
    const hash = sha(String(req.query.state || ''))
    const state = await prisma.$transaction(async (db) => {
      const found = await db.letterOAuthState.findUnique({
        where: { stateHash: hash },
      })
      ensure(
        found && found.expiresAt > new Date(),
        400,
        'Drive connection request expired. Start again from Settings.'
      )
      const used = await db.letterOAuthState.deleteMany({
        where: { stateHash: hash },
      })
      ensure(used.count === 1, 400, 'Drive connection request already used')
      await scope(db, {
        actorId: found.directorId,
        actorType: 'director',
        workspaceId: found.workspaceId,
      })
      return found
    })
    ensure(
      !req.query.error && typeof req.query.code === 'string',
      400,
      'Google authorization was not completed. Return to Settings and try again.'
    )
    const config = await prisma.letterSettings.findUniqueOrThrow({
      where: { workspaceId: state.workspaceId },
    })
    ensure(
      config.updatedAt.getTime() === state.configVersion.getTime(),
      409,
      'Drive settings changed. Start the connection again.'
    )
    let refresh: string,
      folderId = config.folderId
    try {
      const { tokens } = await oauth(config).getToken(req.query.code as string)
      ensure(
        tokens.refresh_token,
        400,
        'Google did not return offline access. Start the connection again and allow access.'
      )
      refresh = tokens.refresh_token
      const connected = { ...config, encryptedRefreshToken: encrypt(refresh) }
      if (managedClient())
        folderId = await ensureFolder(connected, 'Taskwise Letters')
      else await verifyFolder(connected)
    } catch (e) {
      if (e instanceof LetterError) throw e
      throw new LetterError(
        400,
        'Could not connect to the selected Drive folder. Check the account and folder permissions.'
      )
    }
    await prisma.$transaction(async (db) => {
      await scope(db, {
        actorId: state.directorId,
        actorType: 'director',
        workspaceId: state.workspaceId,
      })
      const updated = await db.letterSettings.updateMany({
        where: {
          workspaceId: state.workspaceId,
          updatedAt: state.configVersion,
        },
        data: {
          connected: true,
          folderId,
          encryptedRefreshToken: encrypt(refresh),
        },
      })
      ensure(updated.count === 1, 409, 'Settings changed. Connect again.')
      await db.letterAttachment.updateMany({
        where: {
          event: { workspaceId: state.workspaceId },
          uploadState: 'BLOCKED',
        },
        data: {
          uploadState: 'PENDING',
          uploadNextAt: new Date(),
          uploadAttempts: 0,
        },
      })
      await db.auditLog.create({
        data: {
          workspaceId: state.workspaceId,
          event: 'LETTER_DRIVE_CONNECTED',
          actorType: 'director',
          actorDirectorId: state.directorId,
          payload: { folderId },
        },
      })
    })
    res.redirect(
      303,
      process.env.LETTER_FRONTEND_URL || 'https://syswise.lk/taskwise/'
    )
  })
)
router.use(authenticateToken, express.json({ limit: '12mb' }))

router.get(
  '/context',
  safe(async (req, res) => {
    const a = req.user!,
      s = await scope(prisma, a)
    const [people, directors, config] = await Promise.all([
      prisma.personnel.findMany({
        where: { workspaceId: a.workspaceId, isActive: true, deletedAt: null },
        select: { id: true, name: true, isLetterLogger: true },
        orderBy: { name: 'asc' },
      }),
      prisma.director.findMany({
        where: { workspaceId: a.workspaceId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.letterSettings.findUnique({
        where: { workspaceId: a.workspaceId },
      }),
    ])
    res.json({
      me: s,
      today: today(),
      people: [
        ...directors.map((p) => ({
          key: `director:${p.id}`,
          name: p.name,
          logger: true,
        })),
        ...people.map((p) => ({
          key: `personnel:${p.id}`,
          name: p.name,
          logger: s.director ? p.isLetterLogger : undefined,
        })),
      ],
      entryDelayDays: config?.entryDelayDays ?? 2,
      assigneeDays: config?.assigneeDays ?? 7,
      driveConnected: !!config?.connected,
    })
  })
)
router.get(
  '/settings',
  safe(async (req, res) => {
    const s = await scope(prisma, req.user!)
    ensure(s.director, 403, 'Director access required')
    res.json(
      publicSettings(
        await prisma.letterSettings.findUnique({
          where: { workspaceId: req.user!.workspaceId },
        })
      )
    )
  })
)
router.put(
  '/settings',
  safe(async (req, res) => {
    const a = req.user!,
      b = req.body
    const result = await prisma.$transaction(async (db) => {
      const s = await scope(db, a)
      ensure(s.director, 403, 'Director access required')
      await lock(db, a.workspaceId)
      const old = await db.letterSettings.findUnique({
        where: { workspaceId: a.workspaceId },
      })
      for (const k of ['entryDelayDays', 'assigneeDays'])
        ensure(
          Number.isInteger(b[k]) && b[k] >= 1 && b[k] <= 365,
          400,
          'Delay thresholds must be 1–365 calendar days'
        )
      // With the platform client, Drive fields are server-managed.
      const managed = !!managedClient(),
        folderId = managed
          ? old?.folderId || ''
          : text(b.folderId, 'Folder ID', 200, false),
        clientId = managed
          ? old?.clientId || ''
          : text(b.clientId, 'OAuth client ID', 300, false),
        secret = managed ? '' : text(b.clientSecret, 'Client secret', 500, false)
      ensure(
        !folderId || /^[A-Za-z0-9_-]{10,200}$/.test(folderId),
        400,
        'Enter the folder ID, not its full URL'
      )
      ensure(
        !clientId ||
          /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId),
        400,
        'Enter a Google OAuth client ID'
      )
      const changed =
        folderId !== old?.folderId || clientId !== old?.clientId || !!secret
      ensure(
        !clientId || clientId === old?.clientId || secret,
        400,
        'A new client ID requires its client secret'
      )
      const data = {
        folderId: folderId || null,
        clientId: clientId || null,
        entryDelayDays: b.entryDelayDays,
        assigneeDays: b.assigneeDays,
        ...(secret ? { encryptedSecret: encrypt(secret) } : {}),
        ...(changed ? { connected: false, encryptedRefreshToken: null } : {}),
      }
      const c = await db.letterSettings.upsert({
        where: { workspaceId: a.workspaceId },
        create: { workspaceId: a.workspaceId, ...data },
        update: data,
      })
      await db.auditLog.create({
        data: {
          workspaceId: a.workspaceId,
          event: 'LETTER_SETTINGS_UPDATED',
          actorType: 'director',
          actorDirectorId: a.actorId,
          payload: {
            folderId,
            entryDelayDays: b.entryDelayDays,
            assigneeDays: b.assigneeDays,
            credentialsChanged: changed,
          },
        },
      })
      return publicSettings(c)
    })
    res.json(result)
  })
)
router.put(
  '/loggers/:id',
  safe(async (req, res) => {
    const a = req.user!
    ensure(
      typeof req.body.enabled === 'boolean',
      400,
      'Specify whether Logger permission is enabled'
    )
    await prisma.$transaction(async (db) => {
      const s = await scope(db, a)
      ensure(s.director, 403, 'Only the Director can grant Logger permission')
      const p = await db.personnel.findFirst({
        where: {
          id: req.params.id,
          workspaceId: a.workspaceId,
          isActive: true,
          deletedAt: null,
        },
      })
      ensure(p, 404, 'Staff member not found')
      await db.personnel.update({
        where: { id: p.id },
        data: { isLetterLogger: req.body.enabled },
      })
      await db.auditLog.create({
        data: {
          workspaceId: a.workspaceId,
          event: 'LETTER_LOGGER_PERMISSION',
          actorType: 'director',
          actorDirectorId: a.actorId,
          payload: { personnelId: p.id, enabled: req.body.enabled },
        },
      })
    })
    res.json({ ok: true })
  })
)
router.post(
  '/drive/connect',
  safe(async (req, res) => {
    const a = req.user!,
      s = await scope(prisma, a)
    ensure(s.director, 403, 'Director access required')
    const config = await prisma.letterSettings.findUnique({
      where: { workspaceId: a.workspaceId },
    })
    ensure(
      managedClient() || config?.folderId,
      400,
      'Save a destination folder first'
    )
    const settings =
      config ??
      (await prisma.letterSettings.create({
        data: { workspaceId: a.workspaceId },
      }))
    const client = oauth(settings),
      state = randomBytes(32).toString('hex')
    await prisma.letterOAuthState.create({
      data: {
        stateHash: sha(state),
        workspaceId: a.workspaceId,
        directorId: a.actorId,
        configVersion: settings.updatedAt,
        expiresAt: new Date(Date.now() + 600000),
      },
    })
    res.json({
      url: client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [driveScope()],
        state,
        ...(typeof req.body?.email === 'string' && req.body.email.includes('@')
          ? { login_hint: req.body.email.trim().slice(0, 320) }
          : {}),
      }),
    })
  })
)
router.post(
  '/drive/test',
  safe(async (req, res) => {
    const s = await scope(prisma, req.user!)
    ensure(s.director, 403, 'Director access required')
    const config = await prisma.letterSettings.findUnique({
      where: { workspaceId: req.user!.workspaceId },
    })
    ensure(config?.connected, 400, 'Connect Google Drive first')
    try {
      res.json({ name: await verifyFolder(config) })
    } catch {
      throw new LetterError(
        400,
        'Drive check failed. Reconnect and verify folder permissions.'
      )
    }
  })
)
router.post(
  '/drive/disconnect',
  safe(async (req, res) => {
    const a = req.user!
    await prisma.$transaction(async (db) => {
      const s = await scope(db, a)
      ensure(s.director, 403, 'Director access required')
      await db.letterSettings.updateMany({
        where: { workspaceId: a.workspaceId },
        data: { connected: false, encryptedRefreshToken: null },
      })
      await db.letterOAuthState.deleteMany({
        where: { workspaceId: a.workspaceId },
      })
      await db.auditLog.create({
        data: {
          workspaceId: a.workspaceId,
          event: 'LETTER_DRIVE_DISCONNECTED',
          actorType: 'director',
          actorDirectorId: a.actorId,
          payload: {},
        },
      })
    })
    res.json({ ok: true })
  })
)

router.get(
  '/',
  safe(async (req, res) => {
    const a = req.user!,
      s = await scope(prisma, a),
      base = visibility(a.workspaceId, s),
      q = String(req.query.q || '').slice(0, 200),
      status = String(req.query.status || '')
    const page = Math.max(0, Math.min(100000, Number(req.query.page) || 0))
    const where: Prisma.LetterThreadWhereInput = {
      AND: [
        base,
        ...(['OPEN', 'CLOSED'].includes(status) ? [{ status }] : []),
        ...(req.query.mine === 'true' ? [{ assignedTo: s.key }] : []),
        ...(q
          ? [
              {
                OR: ['reference', 'subject', 'sender', 'externalReference'].map(
                  (k) => ({ [k]: { contains: q, mode: 'insensitive' } })
                ),
              },
            ]
          : []),
      ],
    }
    const [items, total, all, incoming, config] = await Promise.all([
      prisma.letterThread.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: Math.floor(page) * 30,
        take: 30,
        include: { _count: { select: { events: true } } },
      }),
      prisma.letterThread.count({ where }),
      prisma.letterThread.findMany({
        where: base,
        select: {
          status: true,
          assignedAt: true,
          assignedTo: true,
          assignedToName: true,
        },
      }),
      prisma.letterEvent.findMany({
        where: { kind: 'INCOMING', thread: base },
        select: { receivedDate: true, createdAt: true },
      }),
      prisma.letterSettings.findUnique({
        where: { workspaceId: a.workspaceId },
      }),
    ])
    const dateNow = today(),
      limit = config?.assigneeDays ?? 7,
      entryLimit = config?.entryDelayDays ?? 2
    const delays = incoming.map((e) =>
      days(e.receivedDate!, today(e.createdAt))
    )
    const holders: Record<
      string,
      { name: string; open: number; overdue: number; maxDays: number }
    > = {}
    for (const t of all.filter((t) => t.status === 'OPEN')) {
      const age = days(today(t.assignedAt), dateNow)
      const h = (holders[t.assignedTo] ??= {
        name: t.assignedToName,
        open: 0,
        overdue: 0,
        maxDays: 0,
      })
      h.open++
      h.overdue += Number(age >= limit)
      h.maxDays = Math.max(h.maxDays, age)
    }
    res.json({
      items: items.map((t) => ({
        ...t,
        entryDelayDays: days(t.firstReceivedDate, today(t.createdAt)),
        assigneeAgeDays:
          t.status === 'OPEN' ? days(today(t.assignedAt), dateNow) : 0,
      })),
      total,
      page: Math.floor(page),
      metrics: {
        open: all.filter((t) => t.status === 'OPEN').length,
        closed: all.filter((t) => t.status === 'CLOSED').length,
        overdue: Object.values(holders).reduce((n, h) => n + h.overdue, 0),
        lateEntries: delays.filter((d) => d >= entryLimit).length,
        averageEntryDays: delays.length
          ? Math.round(
              (delays.reduce((a, b) => a + b, 0) / delays.length) * 10
            ) / 10
          : 0,
        holders: Object.values(holders).sort((a, b) => b.maxDays - a.maxDays),
      },
      thresholds: { entryDelayDays: entryLimit, assigneeDays: limit },
    })
  })
)
router.post(
  '/',
  safe(async (req, res) => {
    const a = req.user!,
      b = req.body,
      id = requestId(b.requestId),
      hash = sha(JSON.stringify(b))
    // Check membership before decoding file buffers.
    const s = await scope(prisma, a)
    ensure(s.logger, 403, 'Letter Logger or Director permission required')
    const subject = text(b.subject, 'Subject', 250),
      sender = text(b.sender, 'Sender', 250),
      received = date(b.receivedDate, 'Received date'),
      notes = text(b.notes, 'Important details', 10000, false),
      channel = text(b.channel, 'Channel', 20)
    ensure(
      ['PHYSICAL', 'DIGITAL'].includes(channel),
      400,
      'Choose Physical or Digital'
    )
    const attachments = files(b.files || [])
    const result = await prisma.$transaction(
      async (db) => {
        const live = await scope(db, a)
        ensure(live.logger, 403, 'Letter Logger permission required')
        await lock(db, a.workspaceId)
        const existing = await db.letterEvent.findUnique({
          where: {
            workspaceId_requestId: {
              workspaceId: a.workspaceId,
              requestId: id,
            },
          },
        })
        if (existing) {
          ensure(
            existing.actorKey === live.key && existing.requestHash === hash,
            409,
            'Request identifier already used'
          )
          return { id: existing.threadId }
        }
        const year = Number(today().slice(0, 4)),
          counter = await db.letterCounter.upsert({
            where: { workspaceId_year: { workspaceId: a.workspaceId, year } },
            create: { workspaceId: a.workspaceId, year, value: 1 },
            update: { value: { increment: 1 } },
          })
        const thread = await db.letterThread.create({
          data: {
            workspaceId: a.workspaceId,
            reference: `${live.prefix}-LTR-${year}-${String(counter.value).padStart(6, '0')}`,
            subject,
            sender,
            senderContact: text(b.senderContact, 'Sender contact', 300, false),
            externalReference: text(
              b.externalReference,
              'External reference',
              200,
              false
            ),
            channel,
            createdBy: live.key,
            createdByName: live.name,
            assignedTo: live.key,
            assignedToName: live.name,
            firstReceivedDate: received,
            latestReceivedDate: received,
            access: { create: { actorKey: live.key } },
            events: {
              create: {
                workspaceId: a.workspaceId,
                requestId: id,
                requestHash: hash,
                sequence: 1,
                kind: 'INCOMING',
                actorKey: live.key,
                actorName: live.name,
                notes,
                correspondent: sender,
                receivedDate: received,
                attachments: { create: attachments },
              },
            },
          },
        })
        return { id: thread.id, reference: thread.reference }
      },
      { timeout: 20000 }
    )
    res.status(201).json(result)
  })
)
router.get(
  '/:id',
  safe(async (req, res) => {
    const a = req.user!,
      s = await scope(prisma, a)
    const t = await prisma.letterThread.findFirst({
      where: { AND: [visibility(a.workspaceId, s), { id: req.params.id }] },
      include: {
        events: {
          orderBy: { sequence: 'asc' },
          include: { attachments: { select: attachmentSelect } },
        },
        access: true,
      },
    })
    ensure(t, 404, 'Letter not found')
    const manage = s.director || t.createdBy === s.key || t.assignedTo === s.key
    res.json({
      ...t,
      permissions: {
        canManage: manage,
        canReply: manage && t.status === 'OPEN',
        canReceive: s.director || t.createdBy === s.key,
      },
      entryDelayDays: days(t.firstReceivedDate, today(t.createdAt)),
      assigneeAgeDays:
        t.status === 'OPEN' ? days(today(t.assignedAt), today()) : 0,
      events: t.events.map((e) => ({
        ...e,
        entryDelayDays: e.receivedDate
          ? days(e.receivedDate, today(e.createdAt))
          : null,
        holdingDays: e.previousAssignedAt
          ? days(today(e.previousAssignedAt), today(e.createdAt))
          : null,
      })),
    })
  })
)
router.post(
  '/:id/events',
  safe(async (req, res) => {
    const a = req.user!,
      b = req.body,
      id = requestId(b.requestId),
      hash = sha(JSON.stringify(b))
    await scope(prisma, a)
    const kind = text(b.kind, 'Action', 20)
    ensure(
      ['INCOMING', 'OUTGOING', 'TRANSFER', 'NOTE', 'SHARE'].includes(kind),
      400,
      'Unknown letter action'
    )
    const notes = text(
        b.notes,
        'Notes',
        10000,
        kind === 'NOTE' || kind === 'TRANSFER'
      ),
      attachments = files(b.files || [])
    ensure(
      !['TRANSFER', 'SHARE'].includes(kind) || attachments.length === 0,
      400,
      'Attachments belong to correspondence or notes'
    )
    ensure(
      kind !== 'OUTGOING' || attachments.length > 0,
      400,
      'Attach a copy of the outgoing reply'
    )
    const result = await prisma.$transaction(
      async (db) => {
        const s = await scope(db, a)
        await lock(db, req.params.id)
        const t = await db.letterThread.findFirst({
          where: { AND: [visibility(a.workspaceId, s), { id: req.params.id }] },
        })
        ensure(t, 404, 'Letter not found')
        const duplicate = await db.letterEvent.findUnique({
          where: {
            workspaceId_requestId: {
              workspaceId: a.workspaceId,
              requestId: id,
            },
          },
        })
        if (duplicate) {
          ensure(
            duplicate.threadId === t.id &&
              duplicate.actorKey === s.key &&
              duplicate.requestHash === hash,
            409,
            'Request identifier already used'
          )
          return { id: t.id }
        }
        ensure(
          b.version === t.version,
          409,
          'This letter changed. Refresh before submitting your action.'
        )
        const manager =
          s.director || t.createdBy === s.key || t.assignedTo === s.key
        if (kind === 'INCOMING')
          ensure(
            s.director || t.createdBy === s.key,
            403,
            'Only the Director or original letter enterer may record incoming replies and reopen this thread'
          )
        else
          ensure(
            manager,
            403,
            'Only the current assignee, original enterer or Director may change this letter'
          )
        if (kind === 'TRANSFER' || kind === 'OUTGOING')
          ensure(
            t.status === 'OPEN',
            409,
            'This thread is closed. A new incoming reply must reopen it first.'
          )
        const data: Prisma.LetterThreadUpdateInput = {
          version: { increment: 1 },
        }
        const event: any = {
          workspaceId: a.workspaceId,
          threadId: t.id,
          requestId: id,
          requestHash: hash,
          sequence: t.version + 1,
          kind,
          actorKey: s.key,
          actorName: s.name,
          notes,
          attachments: { create: attachments },
        }
        if (kind === 'INCOMING') {
          const received = date(b.receivedDate, 'Received date')
          ensure(
            received >= t.latestReceivedDate,
            400,
            'Incoming reply cannot precede the previous received date'
          )
          event.receivedDate = received
          event.correspondent = text(b.correspondent || t.sender, 'Sender', 250)
          data.latestReceivedDate = received
          data.status = 'OPEN'
          data.closedAt = null
          if (t.status === 'CLOSED') {
            data.assignedAt = new Date()
            event.previousAssignedAt = t.assignedAt
            event.toAssignee = t.assignedTo
            event.toAssigneeName = t.assignedToName
          }
          await notify(
            db,
            a.workspaceId,
            t.assignedTo,
            t.id,
            t.reference,
            'A new incoming reply is ready for action.'
          )
        }
        if (kind === 'OUTGOING') {
          event.correspondenceDate = date(b.correspondenceDate, 'Reply date')
          ensure(
            event.correspondenceDate >= t.latestReceivedDate,
            400,
            'Reply date cannot precede the latest received date'
          )
          event.correspondent = text(
            b.correspondent || t.sender,
            'Recipient',
            250
          )
          event.previousAssignedAt = t.assignedAt
          data.status = 'CLOSED'
          data.closedAt = new Date()
          if (t.createdBy !== s.key)
            await notify(
              db,
              a.workspaceId,
              t.createdBy,
              t.id,
              t.reference,
              'An outgoing reply was logged; the thread is closed.'
            )
        }
        if (kind === 'TRANSFER' || kind === 'SHARE') {
          const person = await memberByKey(
            db,
            a.workspaceId,
            text(b.personKey, 'Staff member', 100)
          )
          if (kind === 'TRANSFER') {
            ensure(person.key !== t.assignedTo, 400, 'Choose another assignee')
            Object.assign(event, {
              fromAssignee: t.assignedTo,
              fromAssigneeName: t.assignedToName,
              toAssignee: person.key,
              toAssigneeName: person.name,
              previousAssignedAt: t.assignedAt,
            })
            Object.assign(data, {
              assignedTo: person.key,
              assignedToName: person.name,
              assignedAt: new Date(),
            })
          } else {
            event.toAssignee = person.key
            event.toAssigneeName = person.name
          }
          await db.letterAccess.upsert({
            where: {
              threadId_actorKey: { threadId: t.id, actorKey: person.key },
            },
            create: { threadId: t.id, actorKey: person.key },
            update: {},
          })
          await notify(
            db,
            a.workspaceId,
            person.key,
            t.id,
            t.reference,
            kind === 'TRANSFER'
              ? 'This letter has been assigned to you.'
              : 'This letter has been shared with you for viewing.'
          )
        }
        await db.letterEvent.create({ data: event })
        await db.letterThread.update({ where: { id: t.id }, data })
        return { id: t.id }
      },
      { timeout: 20000 }
    )
    res.status(201).json(result)
  })
)
router.get(
  '/files/:id/:view',
  safe(async (req, res) => {
    const a = req.user!,
      s = await scope(prisma, a),
      attachment = await prisma.letterAttachment.findFirst({
        where: {
          id: req.params.id,
          event: { thread: visibility(a.workspaceId, s) },
        },
        select: {
          id: true,
          name: true,
          mime: true,
          original: req.params.view === 'original',
        },
      })
    ensure(attachment, 404, 'Attachment not found')
    res
      .set('Cache-Control', 'private, no-store')
      .set('X-Content-Type-Options', 'nosniff')
    if (req.params.view === 'original') {
      res
        .set(
          'Content-Disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`
        )
        .type(attachment.mime)
        .send(attachment.original)
      return
    }
    ensure(/^\d+$/.test(req.params.view), 404, 'Preview not found')
    const page = await prisma.letterPreview.findUnique({
      where: {
        attachmentId_page: {
          attachmentId: attachment.id,
          page: Number(req.params.view),
        },
      },
    })
    ensure(page, 404, 'Preview not ready')
    res.type('image/webp').send(page.bytes)
  })
)
router.post(
  '/files/:id/retry',
  safe(async (req, res) => {
    const a = req.user!,
      s = await scope(prisma, a)
    const f = await prisma.letterAttachment.findFirst({
      where: {
        id: req.params.id,
        event: { thread: visibility(a.workspaceId, s) },
      },
      include: { event: { include: { thread: true } } },
    })
    ensure(f, 404, 'Attachment not found')
    ensure(
      s.director ||
        f.event.thread.createdBy === s.key ||
        f.event.thread.assignedTo === s.key,
      403,
      'Only the owner or Director can retry'
    )
    const data: any = {}
    if (['FAILED', 'BLOCKED'].includes(f.uploadState))
      Object.assign(data, {
        uploadState: 'PENDING',
        uploadAttempts: 0,
        uploadNextAt: new Date(),
        uploadError: null,
      })
    if (f.previewState === 'FAILED')
      Object.assign(data, {
        previewState: 'PENDING',
        previewAttempts: 0,
        previewNextAt: new Date(),
        previewError: null,
      })
    await prisma.letterAttachment.update({ where: { id: f.id }, data })
    res.json({ ok: true })
  })
)
router.use(
  (err: any, _req: Request, res: Response, _next: express.NextFunction) =>
    res
      .status(err?.type === 'entity.too.large' ? 413 : 400)
      .json({
        error:
          err?.type === 'entity.too.large'
            ? 'Attachments exceed the upload limit'
            : 'Invalid letter request',
      })
)
export default router
