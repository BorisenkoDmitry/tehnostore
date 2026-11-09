async (page) => {
  const results = { generated_at: new Date().toISOString(), safety: "One real UI checkout using only dedicated QA fixture inventory; no external payment or notification", checks: [], errors: [] }
  const check = (name, passed, evidence) => { results.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence }); if (!passed) throw new Error(`${name}: ${JSON.stringify(evidence)}`) }
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const p = await context.newPage()
  p.setDefaultTimeout(30000)
  p.setDefaultNavigationTimeout(45000)
  p.on("pageerror", error => results.errors.push(error.message))
  p.on("console", message => { if (message.type() === "error") results.errors.push(message.text()) })
  let checkoutRequest
  p.on("request", request => {
    if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes("QA Checkout")) checkoutRequest = { url: request.url(), headers: request.headers(), body: request.postData() }
  })
  try {
    await p.goto("http://localhost:8000/dk/products/texno-cart-qa-fixture-20261107?v_id=variant_01M6STP37T9W04ZDKT34JGTB7W", { waitUntil: "domcontentloaded" })
    await p.locator(".texno-shell.is-hydrated").waitFor()
    await p.getByTestId("add-product-button").click()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "1")
    await p.getByRole("link", { name: "Корзина, товаров: 1", exact: true }).click()
    await p.getByTestId("cart-item").waitFor()
    await p.locator(".texno-shell.is-hydrated").waitFor()
    await p.locator('input[name="name"]').fill("QA Checkout")
    await p.locator('input[name="phone"]').fill("+7 (999) 000-00-00")
    await p.locator('input[name="delivery_method"][value="moscow"]').check()
    await p.locator('input[name="address.street"]').fill("Тестовая улица")
    await p.locator('input[name="address.metro"]').fill("Тестовая станция")
    await p.locator('input[name="address.house"]').fill("1")
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    await p.locator('input[name="delivery_date"]').fill(date)
    await p.locator('select[name="delivery_slot"]').selectOption("10:00–14:00")
    await p.locator('input[name="services"][value="sim"]').check()
    await p.locator('input[name="services"][value="protection"]').check()
    await p.locator('textarea[name="comment"]').fill("Локальная QA проверка. Не отправлять, не связываться, без оплаты.")
    await p.locator('input[name="consent"]').check()
    await p.waitForFunction(() => Number(document.querySelector('[data-testid="cart-total"]')?.textContent.replace(/[^\d,.-]/g, "").replace(",", ".")) === 2289)
    check("UI server quote has fixture1500+shipping299+services490", (await p.getByTestId("cart-total").innerText()).includes("2 289"))
    check("email remains optional and blank", await p.locator('input[name="email"]').inputValue() === "")
    await p.locator('input[name="phone"]').fill("abcdefghij")
    await p.getByTestId("checkout-submit").click()
    await p.getByRole("alert").filter({ hasText: /Проверьте номер телефона/ }).waitFor()
    check("server rejects invalid phone without losing contact form", await p.locator('input[name="name"]').inputValue() === "QA Checkout" && await p.locator('input[name="phone"]').inputValue() === "abcdefghij" && await p.getByTestId("order-confirmation").count() === 0)
    await p.locator('input[name="phone"]').fill("+7 (999) 000-00-00")
    let tampered = false
    const tamperPrice = async route => {
      const request = route.request()
      const body = request.postData()
      if (request.method() !== "POST" || !request.headers()["next-action"] || !body?.includes("QA Checkout")) return route.continue()
      try {
        const payload = JSON.parse(body)
        const patch = value => {
          if (!value || typeof value !== "object") return
          if ("expected_total" in value) { value.expected_total = 1; tampered = true }
          for (const child of Object.values(value)) patch(child)
        }
        patch(payload)
        if (!tampered) return route.abort("aborted")
        return route.continue({ postData: JSON.stringify(payload) })
      } catch { return route.abort("aborted") }
    }
    await p.route("http://localhost:8000/dk/cart", tamperPrice)
    await p.getByTestId("checkout-submit").click()
    await p.getByRole("alert").filter({ hasText: /Стоимость корзины изменилась|request conflicted/ }).waitFor()
    check("tampered UI expected total is rejected before order creation", tampered && await p.getByTestId("order-confirmation").count() === 0 && await p.locator('input[name="name"]').inputValue() === "QA Checkout", { displayed_error: await p.getByRole("alert").filter({ hasText: /Стоимость корзины изменилась|request conflicted/ }).innerText() })
    await p.unroute("http://localhost:8000/dk/cart", tamperPrice)
    await p.getByTestId("checkout-submit").click()
    await p.getByTestId("order-confirmation").waitFor({ timeout: 45000 })
    const id = await p.getByTestId("order-id").getAttribute("data-order-id")
    const displayId = await p.getByTestId("order-id").innerText()
    check("actual UI stores order and returns identifier", /^order_/.test(id ?? "") && displayId.trim().length > 0, { id, display_id: displayId })
    results.order = { id, display_id: displayId, expected_total: 2289 }
    check("confirmation explicitly unpaid", (await p.getByTestId("order-confirmation").innerText()).includes("Не оплачен"))
    await p.reload({ waitUntil: "domcontentloaded" })
    await p.getByTestId("order-confirmation").waitFor()
    check("order confirmation persists after reload", await p.getByTestId("order-id").getAttribute("data-order-id") === id)
    check("completed cart no longer included in header", await p.locator(".texno-cart-count").innerText() === "0")
    if (checkoutRequest) {
      const { host, "content-length": length, ...headers } = checkoutRequest.headers
      const replay = await p.request.post(checkoutRequest.url, { headers, data: checkoutRequest.body })
      const replayBody = await replay.text()
      check("same successful checkout server-action retry returns same order", replay.status() === 200 && replayBody.includes(id), { status: replay.status(), same_order: replayBody.includes(id) })
    } else results.checks.push({ name: "checkout retry replay", status: "NOTCHECKED", evidence: "Checkout action request was not captured" })
    for (const [device, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      await p.setViewportSize({ width, height })
      await p.screenshot({ path: `G:/WorkSpace/магазины/tehno-store/commerce/output/cart-qa-confirmation-${device}.png`, fullPage: true, animations: "disabled" })
      check(`confirmation ${device} no overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    }
    check("checkout browser clean runtime", results.errors.length === 0, results.errors)
  } catch (error) {
    results.error = error.message
    results.failure_surface = { url: p.url(), title: await p.title(), alerts: await p.getByRole("alert").allTextContents(), cart_count: await p.locator(".texno-cart-count").allTextContents() }
    await p.screenshot({ path: "G:/WorkSpace/магазины/tehno-store/commerce/output/cart-qa-checkout-failure.png", fullPage: true, animations: "disabled" })
  }
  await context.close()
  results.summary = results.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return results
}
