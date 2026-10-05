import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test.beforeEach(async ({ page }) => {
  const fixture = JSON.parse(readFileSync('.cache/roles-fixture.json', 'utf8'))
  await page.route(/\/(?:taskwise-api\/)?api\//, async route => {
    const url = new URL(route.request().url())
    const response = await route.fetch({ url: 'http://127.0.0.1:4327' + url.pathname.replace('/taskwise-api', '') + url.search })
    await route.fulfill({ response })
  })
  await page.addInitScript(fixture => {
    localStorage.setItem('taskwise_token', fixture.token)
    localStorage.setItem('taskwise_user', JSON.stringify(fixture.user))
    localStorage.setItem('taskwise_view', 'hierarchy_manager')
    localStorage.setItem('taskwise_setup_' + fixture.user.actorId, '1')
  }, fixture)
  await page.goto('/taskwise/?legacy=1')
  await page.getByRole('button', { name: 'Roles', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Roles', exact: true })).toBeVisible()
})

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }) })

test('one Chairman role displays management access and only collected phone assignments', async ({ page }) => {
  await expect(page.getByText('3 fixed roles.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: /Chairman.*94771234500/ })).toHaveCount(1)
  await expect(page.getByText('Company management', { exact: true })).toHaveCount(1)
  await expect(page.getByText('No phone number assigned', { exact: true })).toHaveCount(1)
  await expect(page.getByText('0770000003', { exact: true })).toHaveCount(0)
})

test('Director creates another role in the existing department without login credentials', async ({ page }) => {
  const fixture = JSON.parse(readFileSync('.cache/roles-fixture.json', 'utf8'))
  await page.getByRole('button', { name: 'Add role', exact: true }).click()
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Create role' }) })
  await form.getByLabel('Role name', { exact: true }).fill('Additional secretary')
  await form.getByLabel('Department', { exact: true }).selectOption(fixture.departmentId)
  await expect(form.getByLabel(/password|phone|login/i)).toHaveCount(0)
  await form.getByRole('button', { name: 'Save role', exact: true }).click()
  await expect(page.getByText('4 fixed roles.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: /Additional secretary.*Assign number/ })).toBeVisible()
})

test('assignment form uses country selection and digit boxes with stable typing and country validation', async ({ page }) => {
  await page.getByRole('button', { name: /Assistant secretary.*Assign number/ }).click()
  const mobile = page.getByLabel('Mobile number', { exact: true })
  await expect(page.locator('.digit-field__slot')).toHaveCount(9)
  await mobile.pressSequentially('771234502')
  await mobile.press('Home')
  await mobile.press('ArrowRight')
  await mobile.press('8')
  expect(await mobile.evaluate((e: HTMLInputElement) => e.selectionStart)).toBe(2)
  await mobile.fill('771234502')
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Role assignment saved')
  await page.getByRole('button', { name: /Assistant secretary.*94771234502/ }).click()
  await page.getByLabel('Country and calling code').selectOption('US')
  await expect(page.getByLabel('Email address')).toBeVisible()
  await expect(page.locator('.digit-field__slot')).toHaveCount(10)
  await mobile.fill('12')
  await page.getByLabel('Email address').fill('fixture@example.com')
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter a valid mobile number')
})

test('Director adds, lists and removes a named holder of the Chairman role', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add another holder to Chairman', exact: true }).click()
  await page.getByLabel('Holder name', { exact: true }).fill('Chairman Delegate')
  await page.getByLabel('Mobile number', { exact: true }).fill('771234520')
  await page.getByRole('button', { name: 'Add holder', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Holder added')
  await expect(page.getByRole('button', { name: /Chairman Delegate.*Same access as Chairman.*94771234520/ })).toBeVisible()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Holder removed')
  await expect(page.getByText('Chairman Delegate', { exact: true })).toHaveCount(0)
})
