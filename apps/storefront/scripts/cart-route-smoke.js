async (page) => {
  const result = { generated_at: new Date().toISOString(), checks: [], errors: [] }
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const p = await context.newPage()
  p.setDefaultNavigationTimeout(45000)
  p.on("pageerror", error => result.errors.push(error.message))
  p.on("console", message => { if (message.type() === "error") result.errors.push(message.text()) })
  for (const route of ["/dk", "/dk/store", "/dk/cart", "/dk/products/texno-example-212752287", "/dk/page/about-us", "/dk/page/delivery", "/dk/page/warranty", "/dk/page/contacts", "/dk/page/reviews", "/dk/page/faq"]) {
    try {
      const response = await p.goto("http://localhost:8000" + route, { waitUntil: "domcontentloaded" })
      await p.locator("h1").first().waitFor()
      await p.locator(".texno-shell.is-hydrated").waitFor()
      const overlay = await p.locator("nextjs-portal").evaluateAll(elements => elements.some(element => /Runtime Error|Unhandled Runtime|fetch failed/.test(element.shadowRoot?.textContent ?? "")))
      result.checks.push({ name: route, status: response?.status() === 200 && !overlay ? "PASS" : "FAIL", evidence: { status: response?.status(), title: await p.title(), overlay } })
    } catch (error) { result.checks.push({ name: route, status: "FAIL", evidence: error.message }) }
  }
  for (const route of ["/dk/terms", "/dk/privacy"]) {
    const response = await p.request.get("http://localhost:8000" + route, { maxRedirects: 0 })
    const location = response.headers().location
    result.checks.push({ name: route + " uses real legal document redirect", status: [301, 302, 303, 307, 308].includes(response.status()) && location?.startsWith("https://") ? "PASS" : "FAIL", evidence: { status: response.status(), location } })
  }
  result.checks.push({ name: "final public routes no console or uncaught errors", status: result.errors.length === 0 ? "PASS" : "FAIL", evidence: result.errors })
  await context.close()
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return result
}
