import { test, expect, type Page } from '@playwright/test'

const file = { id: 'file-1', name: 'Survey Plan and supporting documents.pdf', mime: 'application/pdf', size: 1153434, uploadState: 'READY', previewState: 'READY', pageCount: 1, previews: [{ page: 1 }] }
const thread = {
  id: 'thread-1', reference: 'YC-LTR-2026-000001', subject: 'Annual youth programme · Survey plan', sender: 'Dasun', senderContact: 'sender@example.test',
  channel: 'PHYSICAL', createdBy: 'director:chairman', createdByName: 'Chairman', assignedTo: 'personnel:secretary',
  assignedToName: "Chairman’s Secretary for Programme Administration", assignedAt: '2026-10-02T12:19:00Z',
  firstReceivedDate: '2026-10-02', latestReceivedDate: '2026-10-02', status: 'OPEN', version: 3, createdAt: '2026-10-02T12:14:00Z',
  entryDelayDays: 0, assigneeAgeDays: 1, permissions: { canManage: true, canReply: true, canReceive: true },
  events: [
    { id: 'event-1', sequence: 1, kind: 'INCOMING', actorName: 'Chairman', createdAt: '2026-10-02T12:14:00Z', notes: 'Please review the attached survey plan and confirm the arrangements.\nThe original document is available below.', correspondent: 'Dasun', receivedDate: '2026-10-02', entryDelayDays: 0, attachments: [file] },
    { id: 'event-2', sequence: 2, kind: 'TRANSFER', actorName: 'Chairman', createdAt: '2026-10-02T12:15:00Z', notes: 'Check the programme budget before arranging the survey.', fromAssigneeName: 'Chairman', toAssigneeName: 'Deputy Director – Finance', holdingDays: 0, attachments: [] },
    { id: 'event-3', sequence: 3, kind: 'TRANSFER', actorName: 'Deputy Director – Finance', createdAt: '2026-10-02T12:19:00Z', notes: 'Budget confirmed. Please coordinate the next steps.', fromAssigneeName: 'Deputy Director – Finance', toAssigneeName: "Chairman’s Secretary for Programme Administration", holdingDays: 0, attachments: [] },
  ],
}

async function openThread(page: Page, options: { language?: 'en' | 'si'; readOnly?: boolean; failedFile?: boolean; actor?: 'director' | 'personnel' } = {}) {
  const user = { actorId: 'chairman', actorType: options.actor || 'director', workspaceId: 'letters-fixture', name: 'Chairman', companyName: 'NYSC', preferredLanguage: options.language || 'en', features: ['letters'],
    impersonation: { sessionId: 'ui-fixture', adminId: 'admin', adminName: 'Support', startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), reason: 'Local UI fixture' } }
  const context = { me: { key: 'director:chairman', name: 'Chairman', director: !options.readOnly, logger: true }, today: '2026-10-03', people: [{ key: 'personnel:secretary', name: 'Secretary' }], entryDelayDays: 3, assigneeDays: 7, driveConnected: true }
  const data = structuredClone(thread)
  if (options.readOnly) data.permissions = { canManage: false, canReply: false, canReceive: false }
  if (options.failedFile) Object.assign(data.events[0].attachments[0], { uploadState: 'FAILED', previewState: 'FAILED', uploadError: 'The upload could not finish. Please retry.' })
  await page.route(/\/(?:taskwise-api\/)?api\//, async route => {
    const path = new URL(route.request().url()).pathname.replace('/taskwise-api', '')
    if (path === '/api/auth/me') return route.fulfill({ json: user })
    if (path === '/api/letters/context') return route.fulfill({ json: context })
    if (path === '/api/letters/thread-1') return route.fulfill({ json: data })
    if (path === '/api/letters') return route.fulfill({ json: { items: [data], total: 1, page: 0, pageSize: 50, metrics: { open: 1, closed: 0, overdue: 0, lateEntries: 0, averageEntryDays: 0, holders: [] }, thresholds: { entryDelayDays: 3, assigneeDays: 7 } } })
    if (path === '/api/letters/files/file-1/original') return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n% local UI fixture' })
    if (path === '/api/letters/files/file-1/1') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="white"/><text x="20" y="60">Survey plan preview</text></svg>' })
    return route.fulfill({ json: [] })
  })
  await page.addInitScript(user => {
    localStorage.setItem('taskwise_token', 'local-letter-ui-fixture')
    localStorage.setItem('taskwise_user', JSON.stringify(user))
    localStorage.setItem('taskwise_view', 'letters')
    sessionStorage.setItem('taskwise_letter_open', 'thread-1')
  }, user)
  await page.goto('/taskwise/?legacy=1')
  await expect(page.locator('[data-letter-workspace]')).toBeVisible()
  await expect(page.getByRole('heading', { name: thread.subject })).toBeVisible()
}
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }) })

for (const width of [390, 1024, 1440, 3440]) {
  test(`letter thread stays readable and within the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 3440 ? 1392 : 1000 })
    await openThread(page)
    const documents = page.getByRole('region', { name: 'Documents', exact: true })
    await expect(documents.locator('p').filter({ hasText: file.name })).toBeVisible()
    await expect(documents.getByText('1.1 MB', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Details', exact: true }).getByText(thread.assignedToName, { exact: true })).toBeVisible()
    expect(await page.locator('img[src$="watermark.jpeg"]').count()).toBe(0)
    const workspace = page.locator('[data-letter-workspace]')
    expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    for (const card of await page.locator('[data-letter-document]').all()) {
      expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      const buttons = card.getByRole('button')
      for (const button of await buttons.all()) {
        const bounds = await button.boundingBox()
        expect(bounds!.height).toBeGreaterThanOrEqual(40)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      }
    }
    const headerTop = await page.locator('header').evaluate(el => el.getBoundingClientRect().top)
    expect(headerTop).toBeGreaterThanOrEqual(56)
    await page.screenshot({ path: `.cache/letter-thread-${width}.png`, fullPage: true })
  })
}

test('document preview, download and letter actions remain available', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openThread(page)
  const documents = page.getByRole('region', { name: 'Documents', exact: true })
  await documents.getByRole('button', { name: `Preview ${file.name}`, exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click()
  const downloaded = page.waitForEvent('download')
  await documents.getByRole('button', { name: `Download ${file.name}`, exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe(file.name)
  for (const [action, title] of [['Record reply & close', 'Record outgoing reply & close'], ['Reassign', 'Transfer responsibility'], ['Add note', 'Add internal note'], ['Share view', 'Share for viewing']]) {
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: title, exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
})

test('read-only personnel view has document access without management actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openThread(page, { actor: 'personnel', readOnly: true })
  await expect(page.getByRole('button', { name: 'Record reply & close', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reassign', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Documents', exact: true }).getByRole('button', { name: `Download ${file.name}` })).toBeVisible()
})

test('failed processing exposes a readable message and retry instead of preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openThread(page, { failedFile: true })
  const documents = page.getByRole('region', { name: 'Documents', exact: true })
  await expect(documents.getByText('The upload could not finish. Please retry.')).toBeVisible()
  await expect(documents.getByRole('button', { name: `Preview ${file.name}` })).toHaveCount(0)
  await expect(documents.getByRole('button', { name: `Retry ${file.name}` })).toBeVisible()
})

test('Sinhala labels and long role names fit the mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openThread(page, { language: 'si' })
  await expect(page.getByRole('heading', { name: 'ලේඛන', exact: true })).toBeVisible()
  const documents = page.getByRole('region', { name: 'ලේඛන', exact: true })
  expect(await documents.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ path: '.cache/letter-thread-sinhala.png', fullPage: true })
})
