async (page) => {
  const result = { generated_at: new Date().toISOString(), safety: "Final updated screenshots only: confirmed real products, no checkout, clear guest cart afterward", checks: [], errors: [] }
  const check = (name, passed, evidence) => result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence })
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const p = await context.newPage()
  p.setDefaultTimeout(25000)
  p.on("pageerror", error => result.errors.push(error.message))
  p.on("console", message => { if (message.type() === "error") result.errors.push(message.text()) })
  try {
    for (const [index, url] of ["http://localhost:8000/dk/products/texno-example-212752287?v_id=variant_01M6SEEF191X87W7M80K47BZY1", "http://localhost:8000/dk/products/texno-example-212751354?v_id=variant_01M6SEEF197Q5SFVPA8V06RQYA"].entries()) {
      await p.goto(url, { waitUntil: "domcontentloaded" })
      await p.locator(".texno-shell.is-hydrated").waitFor()
      await p.getByTestId("add-product-button").click()
      await p.waitForFunction(count => document.querySelector(".texno-cart-count")?.textContent === String(count), index + 1)
    }
    await p.getByRole("link", { name: "Корзина, товаров: 2", exact: true }).click()
    await p.waitForURL("**/dk/cart")
    await p.getByTestId("cart-item").first().waitFor()
    await p.locator(".texno-shell.is-hydrated").waitFor()
    await p.locator('input[name="name"]').fill("Тестовый заказ")
    await p.locator('input[name="phone"]').fill("+7 (999) 000-00-00")
    await p.locator('input[name="delivery_method"][value="moscow"]').check()
    for (const [field, value] of [["street", "Тестовая улица"], ["metro", "Тестовая станция"], ["house", "1"]]) await p.locator(`input[name="address.${field}"]`).fill(value)
    await p.locator('input[name="delivery_date"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
    await p.locator('select[name="delivery_slot"]').selectOption("14:00–18:00")
    await p.locator('input[name="services"][value="protection"]').check()
    await p.waitForFunction(() => Number(document.querySelector('[data-testid="cart-total"]')?.textContent.replace(/[^\d,.-]/g, "").replace(",", ".")) === 35579)
    for (const [device, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      await p.setViewportSize({ width, height })
      await p.evaluate(() => { scrollTo(0, 0); document.activeElement?.blur() })
      await p.screenshot({ path: `G:/WorkSpace/магазины/tehno-store/commerce/output/cart-qa-final-${device}.png`, fullPage: true, animations: "disabled" })
      await p.screenshot({ path: `G:/WorkSpace/магазины/tehno-store/commerce/output/cart-qa-final-${device}-fold.png`, animations: "disabled" })
      check(`updated ${device} cart has no horizontal overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      check(`updated ${device} cart does not have floating contact over controls`, await p.locator(".texno-contact").count() === 0)
    }
    check("exact server quote remains35579 with one opt-in", await p.locator('input[name="services"]:checked').count() === 1 && !await p.locator('input[name="consent"]').isChecked())
    await p.getByRole("button", { name: "Очистить корзину", exact: true }).click()
    await p.getByTestId("empty-cart").waitFor()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "0")
    check("final capture cart cleared without order", await p.getByTestId("order-confirmation").count() === 0)
    check("updated final cart clean runtime", result.errors.length === 0, result.errors)
  } catch (error) { result.error = error.message; result.alerts = await p.getByRole("alert").allTextContents() }
  await context.close()
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return result
}
