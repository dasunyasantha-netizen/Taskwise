import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ headless: true })
await mkdir('test-results/test-company', { recursive: true })
try {
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://localhost:3500/?legacy=1&testing=1')
    await page.getByRole('combobox').selectOption('TESTYSO')
    await page.locator('input[type=password]').fill('test@123')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await page.getByText('TEST COMPANY · TESTYSO', { exact: true }).waitFor()
    await page.getByRole('heading', { name: 'YSO Task Hub', exact: true }).waitFor()
    await page.screenshot({ path: `test-results/test-company/${name}-yso.png`, fullPage: true })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow')
    await page.getByRole('button', { name: 'Feedback', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    const dialog = await page.getByRole('dialog').boundingBox()
    assert.ok(dialog && dialog.x >= 0 && dialog.x + dialog.width <= viewport.width)
    await page.screenshot({ path: `test-results/test-company/${name}-feedback.png`, fullPage: true })
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    assert.deepEqual(errors, [], 'No browser errors')
    await context.close()
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto('http://localhost:3500/?legacy=1&testing=1')
  await page.getByRole('combobox').selectOption('TESTCHAIRMAN')
  await page.locator('input[type=password]').fill('test@123')
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.getByText('TEST COMPANY · TESTCHAIRMAN', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Review feedback', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Reset test company', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.screenshot({ path: 'test-results/test-company/desktop-reset.png' })
  await context.close()
  console.log('Passed: desktop/mobile login, YSO view, feedback dialog, no overflow/browser errors, Chairman feedback and reset controls.')
} finally { await browser.close() }
