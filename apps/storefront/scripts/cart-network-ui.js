async (page) => {
  const result = { generated_at: new Date().toISOString(), safety: "Abort browser add-to-cart request before server processing; no checkout", checks: [], errors: [] }
  const check = (name, passed, evidence) => result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence })
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const p = await context.newPage()
  p.on("pageerror", error => result.errors.push(error.message))
  p.setDefaultTimeout(15000)
  try {
    await p.goto("http://localhost:8000/dk/products/texno-example-212752287?v_id=variant_01M6SEEF191X87W7M80K47BZY1", { waitUntil: "domcontentloaded" })
    await p.locator(".texno-shell.is-hydrated").waitFor()
    let aborted = false
    const abort = async route => {
      if (!aborted && route.request().method() === "POST" && route.request().headers()["next-action"]) { aborted = true; return route.abort("failed") }
      return route.continue()
    }
    await p.route("**/*", abort)
    await p.getByTestId("add-product-button").click()
    await p.waitForTimeout(1200)
    await p.unroute("**/*", abort)
    const state = { aborted, disabled: await p.getByTestId("add-product-button").isDisabled(), text: await p.getByTestId("add-product-button").innerText(), alerts: await p.getByRole("alert").allTextContents(), page_errors: result.errors, overlay: await p.locator("nextjs-portal").evaluateAll(elements => elements.some(element => /Runtime Error|Unhandled Runtime|Failed to fetch/.test(element.shadowRoot?.textContent ?? ""))) }
    check("browser network failure releases pending action and shows recoverable error", aborted && !state.disabled && state.alerts.some(text => /соединени|связ|подключени|повтор|ошибк/i.test(text)) && !state.overlay && result.errors.length === 0, state)
    if (!state.disabled) {
      await p.getByTestId("add-product-button").click()
      await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "1")
      check("retry after browser network failure adds one unit", true)
      await p.getByRole("link", { name: "Корзина, товаров: 1", exact: true }).click()
      await p.locator(".texno-shell.is-hydrated").waitFor()
      await p.getByRole("button", { name: "Очистить корзину", exact: true }).click()
      await p.getByTestId("empty-cart").waitFor()
    }
  } catch (error) { result.error = error.message }
  await context.close()
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return result
}
