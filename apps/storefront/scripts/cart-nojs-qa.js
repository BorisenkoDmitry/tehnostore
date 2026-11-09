async (page) => {
  const result = { generated_at: new Date().toISOString(), safety: "No-JavaScript native form adds only one confirmed real accessory; never completes checkout; cart cleared with JS afterward", checks: [] }
  const check = (name, passed, evidence) => { result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence }); if (!passed) throw new Error(`${name}: ${JSON.stringify(evidence)}`) }
  const browser = page.context().browser()
  const contexts = []
  try {
    const discovery = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    contexts.push(discovery)
    const d = await discovery.newPage()
    await d.goto("http://localhost:8000/dk/products/insales-228232661", { waitUntil: "domcontentloaded" })
    await d.locator(".texno-shell.is-hydrated").waitFor()
    let selected
    const colors = await d.locator('input[name="product-color"]').evaluateAll(inputs => inputs.map(input => input.value))
    for (const color of ["Green - Зеленый", ...colors.filter(color => color !== "Green - Зеленый")]) {
      await d.getByRole("radio", { name: color, exact: true }).click()
      await d.waitForTimeout(100)
      if (await d.getByTestId("add-product-button").isEnabled() && new URL(d.url()).searchParams.get("v_id")) { selected = { url: d.url(), color, variant_id: new URL(d.url()).searchParams.get("v_id") }; break }
    }
    check("confirmed actual colored accessory available for no-JS test", !!selected, selected)
    const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } })
    contexts.push(nojs)
    const n = await nojs.newPage()
    await n.goto(selected.url, { waitUntil: "domcontentloaded" })
    const form = n.getByRole("form", { name: "Добавление выбранного товара в корзину" })
    const variantId = await form.locator('input[name="variant_id"]').inputValue()
    const mutationId = await form.locator('input[name="mutation_id"]').inputValue()
    const action = await form.getAttribute("action")
    check("no-JS server HTML contains requested exact variant in native POST form", variantId === selected.variant_id && await form.getAttribute("method") === "post" && action === "/dk/cart/add", { requested: selected.variant_id, rendered: variantId, color: selected.color, action })
    await form.getByTestId("add-product-button").click()
    await n.waitForURL("**/dk/cart")
    const line = n.locator(`[data-testid="cart-item"][data-variant-id="${variantId}"]`)
    await line.waitFor({ state: "attached" })
    check("no-JS native click adds requested real variant to protected RUB cart", await line.getByTestId("cart-line-quantity").textContent() === "1" && await n.locator(".texno-cart-count").textContent() === "1")
    const visible = await line.isVisible()
    result.checks.push({ name: "no-JS cart content is visible after native add", status: visible ? "PASS" : "FAIL", evidence: visible ? undefined : await line.evaluate(element => { const ancestors = []; for (let node = element; node && ancestors.length < 10; node = node.parentElement) ancestors.push({ tag: node.tagName, id: node.id, hidden: node.hidden, display: getComputedStyle(node).display, visibility: getComputedStyle(node).visibility }); return ancestors }) })
    const checkoutForm = n.locator('form').filter({ has: n.locator('input[name="phone"]') })
    check("no-JS checkout cannot leak contact details through default GET", await checkoutForm.getAttribute("method") === "post" && await checkoutForm.getAttribute("action") === "/dk/cart/checkout" && await n.getByTestId("checkout-submit").isDisabled())
    const fallback = await nojs.request.post("http://localhost:8000/dk/cart/checkout", { form: { name: "QA NoJS", phone: "+79990000000" }, maxRedirects: 0 })
    check("no-JS checkout fallback safely declines without query or order", fallback.status() === 400 && /JavaScript/.test(await fallback.text()) && !new URL(fallback.url()).search, { status: fallback.status() })
    const replay = await nojs.request.post("http://localhost:8000" + action, { form: { variant_id: variantId, quantity: "1", mutation_id: mutationId }, headers: { origin: "http://localhost:8000" }, maxRedirects: 0 })
    await n.reload({ waitUntil: "domcontentloaded" })
    check("same native POST body UUID retry does not double-add", replay.status() === 303 && await n.locator(`[data-testid="cart-item"][data-variant-id="${variantId}"] [data-testid="cart-line-quantity"]`).textContent() === "1", { status: replay.status() })
    const foreign = await nojs.request.post("http://localhost:8000" + action, { form: { variant_id: variantId, quantity: "1", mutation_id: mutationId }, headers: { origin: "https://example.invalid" }, maxRedirects: 0 })
    check("foreign Origin native form post rejected", foreign.status() === 403, { status: foreign.status() })
    const cleanup = await browser.newContext({ storageState: { cookies: await nojs.cookies(), origins: [] }, viewport: { width: 1440, height: 1000 } })
    contexts.push(cleanup)
    const c = await cleanup.newPage()
    await c.goto("http://localhost:8000/dk/cart", { waitUntil: "domcontentloaded" })
    await c.locator(".texno-shell.is-hydrated").waitFor()
    await c.getByRole("button", { name: "Очистить корзину", exact: true }).click()
    await c.getByTestId("empty-cart").waitFor()
    await c.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "0")
    check("no-JS test cart cleared and no order created", await c.getByTestId("order-confirmation").count() === 0)
  } catch (error) { result.error = error.message }
  for (const context of contexts) await context.close()
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return result
}
