async (page) => {
  const results = { generated_at: new Date().toISOString(), safety: "Two actual UI checkout attempts for the same dedicated white fixture with stock2, each requesting2. No real stock or payment.", checks: [], errors: [], orders: [] }
  const check = (name, passed, evidence) => results.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence })
  const browser = page.context().browser()
  const contexts = []
  const prepare = async label => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
    contexts.push(context)
    const p = await context.newPage()
    p.setDefaultTimeout(30000)
    p.setDefaultNavigationTimeout(45000)
    p.on("pageerror", error => results.errors.push(error.message))
    p.on("console", message => { if (message.type() === "error") results.errors.push(message.text()) })
    await p.goto("http://localhost:8000/dk/products/texno-cart-qa-fixture-20261107?v_id=variant_01M6STP37VKY19B7ZS3Q0X0RAK", { waitUntil: "domcontentloaded" })
    await p.locator(".texno-shell.is-hydrated").waitFor()
    await p.getByTestId("add-product-button").click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "1")
    await p.getByTestId("add-product-button").click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "2")
    await p.getByRole("link", { name: "Корзина, товаров: 2", exact: true }).click()
    await p.getByTestId("cart-item").waitFor()
    await p.locator(".texno-shell.is-hydrated").waitFor()
    await p.locator('input[name="name"]').fill(`QA Race ${label}`)
    await p.locator('input[name="phone"]').fill(label === "A" ? "+79990000001" : "+79990000002")
    await p.locator('input[name="delivery_method"][value="none"]').check()
    await p.locator('input[name="delivery_date"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
    await p.locator('select[name="delivery_slot"]').selectOption("14:00–18:00")
    await p.locator('input[name="consent"]').check()
    await p.waitForFunction(() => Number(document.querySelector('[data-testid="cart-total"]')?.textContent.replace(/[^\d,.-]/g, "").replace(",", ".")) === 3400 && !document.querySelector('[data-testid="checkout-submit"]').disabled)
    return { label, page: p }
  }
  try {
    const prepared = await Promise.all([prepare("A"), prepare("B")])
    check("both guests can prepare carts before inventory reservation", true)
    await Promise.all(prepared.map(({ page: p }) => p.getByTestId("checkout-submit").click()))
    for (const { label, page: p } of prepared) {
      await p.waitForFunction(() => document.querySelector('[data-testid="order-confirmation"]') || [...document.querySelectorAll('[role="alert"]')].some(el => el.textContent.trim()), { timeout: 45000 })
      const order = await p.getByTestId("order-id").count() ? { id: await p.getByTestId("order-id").getAttribute("data-order-id"), display_id: await p.getByTestId("order-id").innerText() } : null
      if (order) results.orders.push({ ...order, guest: label, expected_total: 3400 })
      results[label] = { order, errors: await p.getByRole("alert").allTextContents() }
    }
    check("only one stock2 order is created from two qty2 checkout races", results.orders.length === 1, { orders: results.orders.length, A: results.A, B: results.B })
    for (const { label, page: p } of prepared.filter(({ label }) => !results[label].order)) {
      await p.reload({ waitUntil: "domcontentloaded" })
      await p.locator(".texno-shell.is-hydrated").waitFor()
      await p.getByTestId("cart-item").waitFor()
      const warnings = await p.getByTestId("cart-item").getByRole("status").allTextContents()
      check("losing guest sees fresh out-of-stock warning and disabled checkout", warnings.some(text => /наличии|Доступно|уточняется/.test(text)) && await p.getByTestId("checkout-submit").isDisabled(), { warnings, guest: label })
      await p.getByRole("button", { name: "Очистить корзину", exact: true }).click()
      await p.getByTestId("empty-cart").waitFor()
      check("unavailable rows can be cleared safely", true)
    }
    check("race browser clean runtime", results.errors.length === 0, results.errors)
  } catch (error) { results.error = error.message }
  for (const context of contexts) await context.close()
  results.summary = results.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return results
}
