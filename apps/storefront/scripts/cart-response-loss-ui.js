async (page) => {
  const result = { generated_at: new Date().toISOString(), safety: "Simulates lost response after server add has completed; real product cart only, never checkout; cleared afterward", checks: [], errors: [] }
  const check = (name, passed, evidence) => { result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence }); if (!passed) throw new Error(name) }
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const p = await context.newPage()
  p.setDefaultTimeout(20000)
  p.on("pageerror", error => result.errors.push(error.message))
  try {
    await p.goto("http://localhost:8000/dk/products/texno-example-212752287?v_id=variant_01M6SEEF191X87W7M80K47BZY1", { waitUntil: "domcontentloaded" })
    await p.locator(".texno-shell.is-hydrated").waitFor()
    await p.getByTestId("add-product-button").click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "1")
    let completedStatus
    let lost = false
    const lose = async route => {
      if (!lost && route.request().method() === "POST" && route.request().headers()["next-action"]) {
        lost = true
        const response = await route.fetch()
        completedStatus = response.status()
        return route.abort("failed")
      }
      return route.continue()
    }
    await p.route("**/*", lose)
    await p.getByTestId("add-product-button").click()
    await p.getByRole("alert").filter({ hasText: /связ|повтор|ещё раз/i }).waitFor()
    await p.unroute("**/*", lose)
    check("successful server add with lost browser response remains retryable", lost && completedStatus === 200 && await p.getByTestId("add-product-button").isEnabled(), { completed_status: completedStatus })
    await p.getByTestId("add-product-button").click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "2")
    await p.getByRole("link", { name: "Корзина, товаров: 2", exact: true }).click()
    await p.waitForURL("**/dk/cart")
    await p.locator(".texno-shell.is-hydrated").waitFor()
    await p.getByTestId("cart-item").waitFor()
    check("retry reuses UUID and does not create a third unit or duplicate line", await p.getByTestId("cart-item").count() === 1 && await p.getByTestId("cart-line-quantity").innerText() === "2", { rows: await p.getByTestId("cart-item").count(), quantities: await p.getByTestId("cart-line-quantity").allTextContents() })
    await p.getByRole("button", { name: "Очистить корзину", exact: true }).click()
    await p.getByTestId("empty-cart").waitFor()
    check("response-loss test cart cleared without order", true)
    check("response loss handled without uncaught runtime error", result.errors.length === 0, result.errors)
  } catch (error) { result.error = error.message; result.alerts = await p.getByRole("alert").allTextContents(); result.failure_surface = { url: p.url(), rows: await p.getByTestId("cart-item").count(), quantities: await p.getByTestId("cart-line-quantity").allTextContents(), header: await p.locator(".texno-cart-count").allTextContents() } }
  await context.close()
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return result
}
