import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

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
  const resultWidths = await page.evaluate(() => {
    const outcome = document.querySelector<HTMLElement>('.waveguide-outcome')
    const stages = [...document.querySelectorAll<HTMLElement>('.result-stage')]
    return {
      outcome: outcome?.getBoundingClientRect().width ?? 0,
      stages: stages.map((stage) => stage.getBoundingClientRect().width),
    }
  })
  expect(resultWidths.outcome).toBeGreaterThan(0)
  expect(resultWidths.stages.every((width) => Math.abs(width - resultWidths.outcome) <= 1)).toBe(true)
  expect(errors).toEqual([])
})

test('plot keeps paper styling across Carbon themes and remains accessible', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Solve modes' }).click()
  const plot = page.getByRole('img', { name: /field profile/i })
  await expect(plot).toBeVisible({ timeout: 30_000 })
  const paperStyle = await plot.evaluate((node: any) => ({
    font: node._fullLayout?.font?.color,
    axis: node._fullLayout?.xaxis?.color,
    grid: node._fullLayout?.xaxis?.gridcolor,
    paper: node._fullLayout?.paper_bgcolor,
  }))
  expect(paperStyle).toEqual({ font: '#1f2933', axis: '#1f2933', grid: '#d9dee4', paper: '#ffffff' })
  const darkToggle = page.getByRole('button', { name: 'Use dark theme' })
  if (await darkToggle.isVisible()) await darkToggle.click()
  await expect.poll(() => plot.evaluate((node: any) => ({
    font: node._fullLayout?.font?.color,
    axis: node._fullLayout?.xaxis?.color,
    grid: node._fullLayout?.xaxis?.gridcolor,
    paper: node._fullLayout?.paper_bgcolor,
  }))).toEqual(paperStyle)
  const lightToggle = page.getByRole('button', { name: 'Use light theme' })
  if (await lightToggle.isVisible()) await lightToggle.click()
  await expect.poll(() => plot.evaluate((node: any) => ({
    font: node._fullLayout?.font?.color,
    axis: node._fullLayout?.xaxis?.color,
    grid: node._fullLayout?.xaxis?.gridcolor,
    paper: node._fullLayout?.paper_bgcolor,
  }))).toEqual(paperStyle)
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

    if (view.id === 'sweeps') {
      const studyView = page.locator('#sweeps')
      const studyTabs = studyView.locator('[role="tab"]')
      await expect(studyTabs).toHaveCount(4)
      for (const tab of await studyTabs.all()) {
        const controlsId = await tab.getAttribute('aria-controls')
        expect(controlsId, 'study tabs must identify their controlled panel').toBeTruthy()
        await expect(page.locator(`#${controlsId}`)).toHaveCount(1)
      }

      await studyView.getByRole('tab', { name: 'Bloch phase', exact: true }).click()
      const blochAxis = page.locator('#bloch-axis')
      const blochState = await blochAxis.evaluate((select) => ({
        value: (select as HTMLSelectElement).value,
        selectedDisabled: (select as HTMLSelectElement).selectedOptions[0]?.disabled ?? false,
        enabledOptions: [...(select as HTMLSelectElement).options].filter((option) => !option.disabled).length,
      }))
      expect(blochState.enabledOptions, 'Bloch defaults must expose a valid option').toBeGreaterThan(0)
      expect(blochState.selectedDisabled, `Bloch axis ${blochState.value} must not start on a disabled option`).toBe(false)
      for (const label of ['Start phase', 'Stop phase']) {
        const phase = studyView.getByRole('spinbutton', { name: new RegExp(label, 'i') })
        expect(await phase.evaluate((input: HTMLInputElement) => input.validity.valid), `${label} must represent ±π without rounding outside its limits`).toBe(true)
      }

      await studyView.getByRole('tab', { name: 'Advanced', exact: true }).click()
      const advancedTabs = studyView.locator('[role="tab"]')
      await expect(advancedTabs.filter({ hasText: 'Numerics' })).toBeVisible()
      for (const tab of await advancedTabs.all()) {
        const label = (await tab.textContent())?.trim()
        if (!label || !['Numerics', 'Robustness', 'Coupling'].includes(label)) continue
        const controlsId = await tab.getAttribute('aria-controls')
        expect(controlsId, `Advanced tab ${label} must identify its controlled panel`).toBeTruthy()
        await expect(page.locator(`#${controlsId}`)).toHaveCount(1)
      }
    }
  }

  expect(errors).toEqual([])
})

test('keeps the compact shell clear of status and navigation collisions', async ({ page }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'fixed viewport regression runs once')

  for (const viewport of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport)
    await solveDefault(page)
    const shell = await page.evaluate(() => {
      const status = document.querySelector<HTMLElement>('.scientific-status-bar')
      const navigation = document.querySelector<HTMLElement>('.scientific-tool-rail')
      const visible = (element: HTMLElement | null) => {
        if (!element) return false
        const style = getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden'
      }
      const statusRect = status?.getBoundingClientRect()
      const navigationRect = visible(navigation) ? navigation?.getBoundingClientRect() : undefined
      return {
        statusBottom: statusRect?.bottom ?? 0,
        navigationTop: navigationRect?.top ?? window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(shell.statusBottom).toBeLessThanOrEqual(shell.navigationTop + 1)
    expect(shell.horizontalOverflow).toBeLessThanOrEqual(1)
  }
})

test('keeps the mobile preview outcome and heading accessible when configuration is open', async ({ page }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'fixed viewport regression runs once')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await expect(page.locator('#configuration-panel')).toBeVisible()
  const mobilePreview = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.scientific-workbench__stage')
    const outcome = document.querySelector<HTMLElement>('.waveguide-outcome')
    const headings = [...document.querySelectorAll('h1')]
    const hiddenHeadings = headings.filter((heading) => heading.getAttribute('aria-hidden') === 'true' || heading.closest('[aria-hidden="true"], [inert]'))
    const stageRect = stage?.getBoundingClientRect()
    const outcomeRect = outcome?.getBoundingClientRect()
    const stageStyle = stage ? getComputedStyle(stage) : undefined
    const clipsOutcome = Boolean(stageRect && outcomeRect && ['hidden', 'clip'].includes(stageStyle?.overflowY ?? '') && outcomeRect.bottom > stageRect.bottom + 1)
    return {
      headingCount: headings.length,
      hiddenHeadingCount: hiddenHeadings.length,
      clipsOutcome,
    }
  })
  expect(mobilePreview.headingCount).toBeGreaterThan(0)
  expect(mobilePreview.hiddenHeadingCount).toBe(0)
  expect(mobilePreview.clipsOutcome).toBe(false)
})

test('keeps every mobile field-display target at least 44 px high', async ({ page }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'fixed viewport regression runs once')

  await page.setViewportSize({ width: 390, height: 844 })
  await solveDefault(page)
  const fieldDisplay = page.locator('.field-part-toolbar [aria-label="Field display"]')
  await expect(fieldDisplay).toBeVisible()
  const layout = await fieldDisplay.evaluate((switcher) => {
    const targets = [...switcher.querySelectorAll<HTMLElement>('button')].map((button) => button.getBoundingClientRect())
    return {
      heights: targets.map(({ height }) => height),
      rows: new Set(targets.map(({ top }) => Math.round(top))).size,
      horizontalOverflow: switcher.scrollWidth - switcher.clientWidth,
    }
  })
  expect(layout.heights).toHaveLength(4)
  expect(layout.heights.every((height) => height >= 44)).toBe(true)
  expect(layout.rows).toBe(2)
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(1)
})

test('uses custom validation without duplicate browser-native form errors', async ({ page }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'fixed viewport regression runs once')

  await page.goto('./')
  await page.getByRole('button', { name: 'Studies', exact: true }).click()
  await page.locator('#sweeps').getByRole('tab', { name: 'Advanced', exact: true }).click()
  await expect(page.locator('#analysis-panel-numerics')).toBeVisible()
  const constrainedForms = await page.locator('form').evaluateAll((forms) => forms
    .filter((form) => form.querySelector('[required], [pattern], [min], [max], [minlength], [maxlength]'))
    .map((form) => ({ id: form.id, noValidate: (form as HTMLFormElement).noValidate })))
  expect(constrainedForms.length).toBeGreaterThan(0)
  expect(constrainedForms.filter((form) => !form.noValidate)).toEqual([])
})
