import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test.beforeEach(async ({ page, context }, testInfo) => {
  const fixture = JSON.parse(readFileSync('.cache/support-fixture.json', 'utf8'))
  const cdp = await context.newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } })
  await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: {
    credentialId: fixture.credentialId, privateKey: fixture.privateKey, rpId: 'localhost', isResidentCredential: false, signCount: testInfo.line * 1000,
  } })
  await page.route(/\/(?:taskwise-api\/)?api\//, async route => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: 'http://127.0.0.1:4317' + url.pathname.replace('/taskwise-api', '') + url.search })
    await route.fulfill({ response })
  })
  await page.route('http://localhost:3100/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Shared sign in</h1>' }))
  await page.addInitScript(fixture => {
    if (!localStorage.getItem('support-fixture-loaded')) {
      localStorage.setItem('support-fixture-loaded', '1')
      localStorage.setItem('taskwise_token', fixture.adminToken)
      localStorage.setItem('taskwise_user', JSON.stringify(fixture.adminUser))
      localStorage.setItem('taskwise_view', 'impersonation')
      localStorage.setItem('taskwise_setup_' + fixture.adminUser.actorId, '1')
    }
  }, fixture)
  await page.goto('/taskwise/?legacy=1')
  await expect(page.getByRole('heading', { name: '1. Select an active role' })).toBeVisible()
})
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }) })

async function startChairman(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Chairman.*Company management/ }).click()
  await page.getByPlaceholder('Example: Investigating ticket TW-1042 with company approval').fill('Investigating approved company support ticket')
  await page.getByRole('button', { name: 'Verify passkey and access as Chairman' }).click()
  await expect(page.getByText('Viewing as', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome back, Chairman' })).toBeVisible()
}

test('role directory displays assigned numbers and Chairman opens using the existing admin passkey', async ({ page }) => {
  await expect(page.getByText('PERSONNEL', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Provincial Director', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Chairman.*Company management/ })).toContainText('+94772222222')
  await startChairman(page)
  await page.getByRole('button', { name: 'Exit View' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back, Support' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('taskwise_user')!).isSyswiseAdmin)).toBe(true)
})

test('cancelled passkey verification leaves the administrator signed in', async ({ page }) => {
  await page.evaluate(() => { navigator.credentials.get = async () => { throw new DOMException('Passkey cancelled', 'NotAllowedError') } })
  await page.getByRole('button', { name: /Chairman.*Company management/ }).click()
  await page.getByPlaceholder('Example: Investigating ticket TW-1042 with company approval').fill('Investigating approved support ticket')
  await page.getByRole('button', { name: 'Verify passkey and access as Chairman' }).click()
  await expect(page.getByText('Passkey verification was cancelled', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('taskwise_user')!).isSyswiseAdmin)).toBe(true)
  await expect(page).toHaveURL(/taskwise/)
})

test('expired support session restores the administrator and supports another session', async ({ page }) => {
  await startChairman(page)
  await page.evaluate(() => { localStorage.setItem('syswise_token', 'local-fixture-only'); window.history.replaceState({}, '', '/taskwise/') })
  await page.route(/\/(?:taskwise-api\/)?api\/auth\/me$/, route => route.fulfill({ status: 401, json: { error: 'Support-access session expired or ended' } }), { times: 1 })
  await page.reload()
  await expect(page.getByRole('heading', { name: '1. Select an active role' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('taskwise_user')!).isSyswiseAdmin)).toBe(true)
  await startChairman(page)
})

test('shared logout during support clears the administrator backup', async ({ page }) => {
  await startChairman(page)
  await page.evaluate(() => {
    localStorage.removeItem('syswise_token')
    window.dispatchEvent(new StorageEvent('storage', { key: 'syswise_token', oldValue: 'local-fixture-only', newValue: null }))
  })
  await expect(page).toHaveURL(/\/auth\/login/)
  await expect(page.getByRole('heading', { name: 'Shared sign in' })).toBeVisible()
})

test('support verification failure displays inline without redirecting to login', async ({ page }) => {
  await page.route(/\/(?:taskwise-api\/)?api\/auth\/impersonation\/verify$/, route => route.fulfill({ status: 403, json: { error: 'Passkey verification failed. Verify again.' } }))
  await page.getByRole('button', { name: /Chairman.*Company management/ }).click()
  await page.getByPlaceholder('Example: Investigating ticket TW-1042 with company approval').fill('Investigating approved support ticket')
  await page.getByRole('button', { name: 'Verify passkey and access as Chairman' }).click()
  await expect(page.getByText('Passkey verification failed. Verify again.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('taskwise_user')!).isSyswiseAdmin)).toBe(true)
})

test('refresh preserves an active support session without sending it through shared login', async ({ page }) => {
  await startChairman(page)
  await page.evaluate(() => { localStorage.setItem('syswise_token', 'local-fixture-only'); window.history.replaceState({}, '', '/taskwise/') })
  await page.reload()
  await expect(page.getByText('Viewing as', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome back, Chairman' })).toBeVisible()
  await page.getByRole('button', { name: 'Exit View' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back, Support' })).toBeVisible()
})

test('the former personnel Chairman opens its role screen without another login', async ({ page }) => {
  await page.getByRole('button', { name: /Chairman.*Role.*94773333333/ }).click()
  await page.getByPlaceholder('Example: Investigating ticket TW-1042 with company approval').fill('Investigating approved support ticket')
  await page.getByRole('button', { name: 'Verify passkey and access as Chairman' }).click()
  await expect(page.getByText('Viewing as', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('taskwise_user')!).actorType)).toBe('personnel')
  await expect(page.getByRole('heading', { name: /sign in/i })).toHaveCount(0)
  await page.getByRole('button', { name: 'Exit View' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back, Support' })).toBeVisible()
})
