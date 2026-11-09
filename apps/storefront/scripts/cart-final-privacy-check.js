async (page) => {
  const result = { generated_at: new Date().toISOString(), checks: [], limitations: ["Next streamed cart view and checkout require JavaScript. Native selected-variant add is supported, with an explicit visible JavaScript notice afterward."] }
  const check = (name, passed, evidence) => result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence })
  const browser = page.context().browser()
  const nojs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } })
  const js = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  try {
    const n = await nojs.newPage()
    await n.goto("http://localhost:8000/dk/cart", { waitUntil: "domcontentloaded" })
    const notice = n.locator("noscript p").filter({ hasText: "Для просмотра корзины и оформления заказа включите JavaScript" })
    check("no-JS requirement notice is visible outside streaming boundary", await notice.isVisible(), { text: await notice.textContent() })
    const p = await js.newPage()
    let capabilityLogged = false
    const errors = []
    p.on("console", message => { if (/x-texno-cart-token/i.test(message.text())) capabilityLogged = true; if (message.type() === "error") errors.push(message.text()) })
    p.on("pageerror", error => errors.push(error.message))
    await p.goto("http://localhost:8000/dk/products/texno-example-212752287?v_id=variant_01M6SEEF191X87W7M80K47BZY1", { waitUntil: "domcontentloaded" })
    await p.locator(".texno-shell.is-hydrated").waitFor()
    await p.getByTestId("add-product-button").click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "1")
    await p.getByRole("link", { name: "Корзина, товаров: 1", exact: true }).click()
    await p.waitForURL("**/dk/cart")
    await p.getByTestId("cart-item").waitFor()
    await p.locator(".texno-shell.is-hydrated").waitFor()
    check("protected guest header and cart work after privacy integration", await p.locator(".texno-cart-count").innerText() === "1" && await p.getByTestId("cart-line-quantity").innerText() === "1")
    await p.getByRole("button", { name: "Очистить корзину", exact: true }).click()
    await p.getByTestId("empty-cart").waitFor()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "0")
    check("privacy check cart cleared without order", await p.getByTestId("order-confirmation").count() === 0)
    check("no capability header logged in browser and clean runtime", !capabilityLogged && errors.length === 0, { capability_logged: capabilityLogged, errors })
  } catch (error) { result.error = error.message }
  await nojs.close()
  await js.close()
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return result
}
