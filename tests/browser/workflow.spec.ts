import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function solveDefault(page: Page) {
  await page.goto('./')
  await page.locator('#mode-solver-form').getByRole('button', { name: 'Solve modes' }).click()
  const outcome = page.getByRole('region', { name: /mode outcome/i })
  await expect(outcome.getByText(/Solved · \d+ failed checks · \d+ solver warnings/)).toBeVisible({ timeout: 30_000 })
  return outcome
}

test('solve exposes one consistent evidence summary without runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const outcome = await solveDefault(page)
  const summary = (await outcome.getByText(/Solved · \d+ failed checks · \d+ solver warnings/).textContent())?.trim()
  expect(summary).toBeTruthy()
  const matchingSurfaces = page.getByText(summary!, { exact: true })
  expect(await matchingSurfaces.count()).toBeGreaterThanOrEqual(3)
  await expect(page.getByRole('region', { name: /mode outcome/i }).getByText(/\d+ failed checks/)).toBeVisible()
  await expect(page.getByRole('region', { name: /mode outcome/i }).getByText(/\d+ solver warnings/)).toBeVisible()
  await expect(page.getByText(/validation issue\(s\)/i)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('plot theme follows changes before and after solve and remains accessible', async ({ page }) => {
  await page.goto('./')
  const darkToggle = page.getByRole('button', { name: 'Use dark theme' })
  if (await darkToggle.isVisible()) await darkToggle.click()
  await page.getByRole('button', { name: 'Solve modes' }).click()
  const plot = page.getByRole('img', { name: /field profile/i })
  await expect(plot).toBeVisible({ timeout: 30_000 })
  const darkColor = await plot.evaluate((node: any) => node._fullLayout?.font?.color)
  await page.getByRole('button', { name: 'Use light theme' }).click()
  await expect.poll(() => plot.evaluate((node: any) => node._fullLayout?.font?.color)).not.toBe(darkColor)
  const audit = await new AxeBuilder({ page }).exclude('.js-plotly-plot').analyze()
  expect(audit.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
})

test('React owns workflow navigation, configuration focus and panel relationships', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })

  await page.goto('./')
  const setup = page.getByRole('button', { name: 'Setup', exact: true })
  const configurationPanel = page.locator('#configuration-panel')
  await expect(setup).toBeVisible()
  await expect(configurationPanel).toBeVisible()

  const configurationPanelIds = ['configuration-geometry', 'configuration-materials', 'configuration-solver']
  for (const panelId of configurationPanelIds) {
    const panel = page.locator(`#${panelId}`)
    await expect(panel).toHaveAttribute('role', 'tabpanel')
    const labelledBy = (await panel.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
    expect(labelledBy.length, `${panelId} must have an aria-labelledby target`).toBeGreaterThan(0)
    for (const labelId of labelledBy) {
      const label = page.locator(`#${labelId}`)
      await expect(label).toHaveCount(1)
      await expect(label).toHaveAttribute('aria-controls', new RegExp(`(?:^|\\s)${panelId}(?:\\s|$)`))
    }
  }

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(configurationPanel).toBeHidden()
  await expect(setup).toBeFocused()
  await setup.click()
  await expect(configurationPanel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(configurationPanel).toBeHidden()
  await expect(setup).toBeFocused()

  await setup.click()
  const coreWidth = page.getByRole('spinbutton', { name: /Core width/i })
  await coreWidth.fill('1.25')
  await expect(page.getByText(/SiN · channel · Modified/)).toBeVisible()

  for (const view of [
    { label: 'Materials', id: 'materials' },
    { label: 'Studies', id: 'sweeps' },
    { label: 'Validation', id: 'validation' },
  ]) {
    await page.getByRole('button', { name: view.label, exact: true }).click()
    await expect(page.locator(`#${view.id}`)).toBeVisible()
    await expect(page.locator('#solver')).toBeHidden()
    await expect(configurationPanel).toBeHidden()
  }

  expect(errors).toEqual([])
})
