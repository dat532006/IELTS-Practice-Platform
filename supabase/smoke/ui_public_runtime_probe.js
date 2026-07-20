// Playwright CLI runtime probe for the independently verified public UI findings.
// Usage: npx --no-install playwright-cli -s=<session> run-code --filename supabase/smoke/ui_public_runtime_probe.js
async page => {
  const base = 'http://127.0.0.1:3000'
  const widths = [320, 390, 768, 1024, 1440, 1920]
  const routes = ['/', '/about', '/products', '/pricing', '/login', '/register', '/products/reading-vol-1']
  const geometry = []
  const consoleProblems = []
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push({ type: message.type(), text: message.text(), url: page.url() })
    }
  })

  async function safeGoto(url) {
    let lastError
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
        if (!response || response.status() < 500) return response
        lastError = new Error('HTTP ' + response.status() + ' for ' + url)
      } catch (error) {
        lastError = error
        await page.waitForTimeout(500)
      }
    }
    throw lastError
  }

  for (const route of routes) {
    const response = await safeGoto(base + route)
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(100)
      geometry.push(await page.evaluate(({ route, width, status }) => ({
        route,
        width,
        status,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        mains: document.querySelectorAll('main').length,
        h1s: document.querySelectorAll('h1').length,
      }), { route, width, status: response ? response.status() : null }))
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await safeGoto(base + '/')
  await page.keyboard.press('Tab')
  const firstFocus = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim(),
    visible: !!(document.activeElement && document.activeElement.getBoundingClientRect().height),
  }))
  await page.keyboard.press('Enter')
  const skipTarget = await page.evaluate(() => ({ id: document.activeElement?.id, tag: document.activeElement?.tagName }))
  const search = page.locator('#landing-search')
  await search.focus()
  const searchFocus = await search.evaluate(element => {
    const own = getComputedStyle(element)
    const wrap = getComputedStyle(element.parentElement)
    return { outline: own.outlineStyle, outlineWidth: own.outlineWidth, wrapShadow: wrap.boxShadow, wrapBorder: wrap.borderColor }
  })

  const toggle = page.getByRole('button', { name: 'Mở menu' })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  const menuFocus = await page.evaluate(() => ({
    text: document.activeElement?.textContent?.trim(),
    inMenu: !!document.activeElement?.closest('#mobile-nav'),
  }))
  await page.keyboard.press('Escape')
  const menuEscape = await page.evaluate(() => ({
    activeLabel: document.activeElement?.getAttribute('aria-label'),
    menuExists: !!document.querySelector('#mobile-nav'),
  }))

  await safeGoto(base + '/products?skill=reading')
  const currentLinks = await page.locator('a[aria-current="page"]').allTextContents()

  await safeGoto(base + '/register')
  const termsHref = await page.getByRole('link', { name: 'Điều khoản' }).getAttribute('href')
  const termsStatus = await page.request.get(base + termsHref).then(response => response.status())

  await safeGoto(base + '/login')
  const revealBox = await page.getByRole('button', { name: 'Hiện mật khẩu' }).boundingBox()
  await page.locator('#login-email').fill('invalid@example.com')
  await page.locator('#login-password').fill('wrong-password')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await page.getByRole('alert').waitFor({ state: 'visible' })
  const authError = await page.evaluate(() => ({
    text: document.querySelector('[role="alert"]')?.textContent?.trim(),
    active: document.activeElement?.id,
    invalid: document.querySelector('#login-email')?.getAttribute('aria-invalid'),
    describedBy: document.querySelector('#login-email')?.getAttribute('aria-describedby'),
  }))

  await safeGoto(base + '/products/reading-vol-1')
  const productBounds = await page.evaluate(() => {
    const card = document.querySelector('.rounded-\\[24px\\]')
    const cta = [...document.querySelectorAll('a,button')].find(element =>
      /Nạp thêm xương cá|Đăng nhập để mua|Vào làm bài|Làm ngay/.test(element.textContent || ''),
    )
    if (!card || !cta) return null
    const parent = card.getBoundingClientRect()
    const child = cta.getBoundingClientRect()
    return {
      parent: { left: parent.left, right: parent.right },
      child: { left: child.left, right: child.right },
      contained: child.left >= parent.left - 1 && child.right <= parent.right + 1,
    }
  })

  const axe = []
  for (const route of ['/', '/login', '/products', '/pricing']) {
    await safeGoto(base + route)
    await page.addScriptTag({ path: process.cwd() + '/node_modules/axe-core/axe.min.js' })
    axe.push(await page.evaluate(async route => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
      return {
        route,
        violations: result.violations
          .filter(item => item.impact === 'critical' || item.impact === 'serious')
          .map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.length })),
      }
    }, route))
  }

  return {
    geometry,
    firstFocus,
    skipTarget,
    searchFocus,
    menuFocus,
    menuEscape,
    currentLinks,
    termsHref,
    termsStatus,
    revealBox,
    authError,
    productBounds,
    axe,
    consoleProblems,
  }
}
