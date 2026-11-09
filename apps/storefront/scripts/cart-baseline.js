async (page) => {
  const result = { phase: "before-cart-implementation", generated_at: new Date().toISOString(), checks: [], pages: [], errors: [] }
  const check = (name, passed, evidence) => result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence })
  const errors = []
  page.on("pageerror", error => errors.push({ type: "pageerror", message: error.message }))
  page.on("console", message => { if (message.type() === "error") errors.push({ type: "console", message: message.text() }) })
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(45000)
  await page.emulateMedia({ reducedMotion: "reduce" })
  for (const route of ["/dk", "/dk/store", "/dk/cart", "/dk/products/texno-example-212752287", "/dk/page/about-us", "/dk/page/delivery", "/dk/page/warranty", "/dk/page/contacts", "/dk/page/reviews", "/dk/page/faq", "/dk/terms", "/dk/privacy"]) {
    try {
    const start = errors.length
    const response = await page.goto(`http://localhost:8000${route}`, { waitUntil: "domcontentloaded" })
    await page.locator("h1").first().waitFor()
    await page.waitForTimeout(650)
    const evidence = await page.evaluate(() => ({
      title: document.title,
      h1: [...document.querySelectorAll("h1")].map(el => el.textContent),
      overflow: document.documentElement.scrollWidth > innerWidth,
      overlay: [...document.querySelectorAll("nextjs-portal")].some(el => /Runtime Error|Unhandled Runtime|isCurrent is not defined|fetch failed/.test(el.shadowRoot?.textContent ?? "")),
      cart_count: document.querySelector(".texno-cart-count")?.textContent,
      empty_hrefs: [...document.querySelectorAll("main a")].filter(el => el.getAttribute("href") === "#").length,
    }))
    const row = { route, status: response?.status(), ...evidence, errors: errors.slice(start) }
    result.pages.push(row)
    check(`${route}: HTTP200, no runtime overlay, no overflow`, row.status === 200 && !row.overlay && !row.overflow, row)
    } catch (error) {
      result.pages.push({ route, status: "NOTCHECKED", reason: error.message })
    }
  }
  for (const [device, width, height] of [["mobile", 390, 844], ["tablet", 768, 1024], ["desktop", 1440, 1000]]) {
    await page.setViewportSize({ width, height })
    await page.goto("http://localhost:8000/dk/cart", { waitUntil: "domcontentloaded" })
    await page.locator("h1").first().waitFor()
    await page.screenshot({ path: `G:/WorkSpace/магазины/tehno-store/commerce/output/cart-qa-baseline-${device}.png`, fullPage: true, animations: "disabled" })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    check(`cart baseline ${device}: no overflow`, !overflow, { width, height })
  }
  result.errors = errors
  check("baseline: no console or uncaught errors", errors.length === 0, errors)
  return result
}
