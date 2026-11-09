async (page) => {
  const result = { generated_at: new Date().toISOString(), safety: "Real confirmed product; checkout request aborted in browser before server processing; no real order or inventory reservation", checks: [], errors: [] }
  const check = (name, passed, evidence) => { result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence }); if (!passed) throw new Error(name) }
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const p = await context.newPage()
  p.setDefaultTimeout(15000)
  p.on("pageerror", error => result.errors.push(error.message))
  const abortNextAction = async () => {
    let aborted = false
    const handler = async route => {
      if (!aborted && route.request().method() === "POST" && route.request().headers()["next-action"]) { aborted = true; return route.abort("failed") }
      return route.continue()
    }
    await p.route("**/*", handler)
    return { done: async () => { await p.unroute("**/*", handler); return aborted } }
  }
  const overlay = () => p.locator("nextjs-portal").evaluateAll(elements => elements.some(element => /Runtime Error|Unhandled Runtime|Failed to fetch/.test(element.shadowRoot?.textContent ?? "")))
  const waitError = async () => p.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(el => /связ|соединени|подключени|повтор|ошибк/i.test(el.textContent)))
  try {
    await p.goto("http://localhost:8000/dk/products/texno-example-212752287?v_id=variant_01M6SEEF191X87W7M80K47BZY1", { waitUntil: "domcontentloaded" })
    await p.locator(".texno-shell.is-hydrated").waitFor()
    let abort = await abortNextAction()
    await p.getByTestId("add-product-button").click()
    await waitError()
    check("add browser network failure shows inline error and releases pending", await abort.done() && await p.getByTestId("add-product-button").isEnabled() && !await overlay(), { alerts: await p.getByRole("alert").allTextContents() })
    await p.getByTestId("add-product-button").click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "1")
    check("add retry creates only one unit", true)
    await p.getByRole("link", { name: "Корзина, товаров: 1", exact: true }).click()
    await p.locator(".texno-shell.is-hydrated").waitFor()
    const plus = p.getByTestId("cart-item").getByRole("button", { name: "Увеличить количество" })
    abort = await abortNextAction()
    await plus.click()
    await waitError()
    check("quantity network failure preserves quantity and releases pending", await abort.done() && await plus.isEnabled() && await p.getByTestId("cart-line-quantity").innerText() === "1" && !await overlay())
    await plus.click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "2")
    check("quantity retry succeeds without duplicate increment", await p.getByTestId("cart-line-quantity").innerText() === "2")
    await p.getByTestId("cart-item").getByRole("button", { name: "Уменьшить количество" }).click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "1")
    abort = await abortNextAction()
    await p.locator('input[name="delivery_method"][value="moscow"]').check()
    await waitError()
    check("quote network failure shows retry and blocks unquoted submit", await abort.done() && await p.getByTestId("checkout-submit").isDisabled() && !await overlay())
    await p.getByRole("button", { name: "Обновить расчёт", exact: true }).click()
    await p.waitForFunction(() => Number(document.querySelector('[data-testid="cart-total"]')?.textContent.replace(/[^\d,.-]/g, "").replace(",", ".")) === 23294 && !document.querySelector('[data-testid="checkout-submit"]').disabled)
    check("quote retry restores server amount23294", true)
    await p.locator('input[name="name"]').fill("QA Network")
    await p.locator('input[name="phone"]').fill("+79990000000")
    await p.locator('input[name="address.street"]').fill("Тестовая улица")
    await p.locator('input[name="address.metro"]').fill("Тестовая станция")
    await p.locator('input[name="address.house"]').fill("1")
    await p.locator('input[name="delivery_date"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
    await p.locator('select[name="delivery_slot"]').selectOption("10:00–14:00")
    await p.locator('input[name="consent"]').check()
    abort = await abortNextAction()
    await p.getByTestId("checkout-submit").click()
    await waitError()
    check("checkout network failure preserves form without creating order", await abort.done() && await p.getByTestId("checkout-submit").isEnabled() && await p.locator('input[name="name"]').inputValue() === "QA Network" && await p.getByTestId("order-confirmation").count() === 0 && !await overlay())
    // Do not retry a valid real-product checkout. Clear its unsubmitted cart.
    abort = await abortNextAction()
    await p.getByRole("button", { name: "Очистить корзину", exact: true }).click()
    await waitError()
    check("clear network failure preserves rows and releases pending", await abort.done() && await p.getByTestId("cart-item").count() === 1 && await p.getByRole("button", { name: "Очистить корзину", exact: true }).isEnabled() && !await overlay())
    await p.getByRole("button", { name: "Очистить корзину", exact: true }).click()
    await p.getByTestId("empty-cart").waitFor()
    check("clear retry leaves empty cart", true)
    check("all aborted actions handled without uncaught runtime errors", result.errors.length === 0, result.errors)
  } catch (error) { result.error = error.message; result.alerts = await p.getByRole("alert").allTextContents() }
  await context.close()
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return result
}
