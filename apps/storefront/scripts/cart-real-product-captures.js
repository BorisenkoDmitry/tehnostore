async (page) => {
  const result = { generated_at: new Date().toISOString(), safety: "Real confirmed products added only; checkout never submitted; guest cart cleared afterward", checks: [], errors: [] }
  const check = (name, passed, evidence) => result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence })
  const products = [
    { title: "Apple iPhone 11 Pro 256GB Green", price: 22995, url: "http://localhost:8000/dk/products/texno-example-212752287?v_id=variant_01M6SEEF191X87W7M80K47BZY1" },
    { title: "Apple Airpods 2 с беспроводной зарядкой чехла", price: 11995, url: "http://localhost:8000/dk/products/texno-example-212751354?v_id=variant_01M6SEEF197Q5SFVPA8V06RQYA" },
  ]
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" })
  const p = await context.newPage()
  p.setDefaultTimeout(30000)
  p.on("pageerror", error => result.errors.push(error.message))
  p.on("console", message => { if (message.type() === "error") result.errors.push(message.text()) })
  try {
    for (const [index, product] of products.entries()) {
      await p.goto(product.url, { waitUntil: "domcontentloaded" })
      await p.locator(".texno-shell.is-hydrated").waitFor()
      check(`${product.title} confirmed available`, (await p.getByTestId("product-availability").innerText()) === "В наличии" && await p.getByTestId("add-product-button").isEnabled())
      await p.getByTestId("add-product-button").click()
      await p.waitForFunction(expected => document.querySelector(".texno-cart-count")?.textContent === String(expected), index + 1)
    }
    await p.getByRole("link", { name: "Корзина, товаров: 2", exact: true }).click()
    await p.getByTestId("cart-item").first().waitFor()
    await p.locator(".texno-shell.is-hydrated").waitFor()
    const first = p.getByTestId("cart-item").first()
    await first.getByRole("button", { name: "Увеличить количество" }).focus()
    await p.keyboard.press("Enter")
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "3")
    check("keyboard Enter increases quantity and live header count", (await first.getByTestId("cart-line-quantity").innerText()) === "2")
    await first.getByRole("button", { name: "Уменьшить количество" }).focus()
    await p.keyboard.press("Enter")
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "2")
    await p.locator('input[name="name"]').focus()
    await p.keyboard.press("Tab")
    check("contact fields follow natural keyboard order", await p.locator('input[name="phone"]').evaluate(input => document.activeElement === input))
    await p.keyboard.press("Tab")
    check("email is keyboard reachable after phone", await p.locator('input[name="email"]').evaluate(input => document.activeElement === input))
    await p.locator('input[name="name"]').fill("Тестовый заказ")
    await p.locator('input[name="phone"]').fill("+7 (999) 000-00-00")
    await p.locator('input[name="delivery_method"][value="moscow"]').check()
    await p.locator('input[name="address.street"]').fill("Тестовая улица")
    await p.locator('input[name="address.metro"]').fill("Тестовая станция")
    await p.locator('input[name="address.house"]').fill("1")
    await p.locator('input[name="delivery_date"]').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
    await p.locator('select[name="delivery_slot"]').selectOption("14:00–18:00")
    await p.locator('input[name="services"][value="protection"]').focus()
    await p.keyboard.press("Space")
    await p.waitForFunction(() => Number(document.querySelector('[data-testid="cart-total"]')?.textContent.replace(/[^\d,.-]/g, "").replace(",", ".")) === 35579)
    check("real products and one service use server total35579", true, { products: products.map(({ title, price }) => ({ title, price })), delivery: 299, service: 290, total: 35579 })
    check("consent remains unchecked and no order is submitted", !await p.locator('input[name="consent"]').isChecked() && await p.getByTestId("order-confirmation").count() === 0)
    check("service checkbox is keyboard operable", await p.locator('input[name="services"][value="protection"]').isChecked())
    check("cart uses actual product images", await p.getByTestId("cart-item").locator("img").evaluateAll(images => images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0)))
    check("reduced motion respected on cart", await p.locator("form").evaluate(form => matchMedia("(prefers-reduced-motion: reduce)").matches && form.getAnimations({ subtree: true }).length === 0))
    for (const [device, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["mobile", 390, 844]]) {
      await p.setViewportSize({ width, height })
      await p.evaluate(() => scrollTo(0, 0))
      await p.evaluate(() => document.activeElement?.blur())
      await p.screenshot({ path: `G:/WorkSpace/магазины/tehno-store/commerce/output/cart-qa-final-${device}.png`, fullPage: true, animations: "disabled" })
      await p.screenshot({ path: `G:/WorkSpace/магазины/tehno-store/commerce/output/cart-qa-final-${device}-fold.png`, animations: "disabled" })
      check(`real cart ${device} no overflow`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      check(`real cart ${device} quantity/delete targets at least44px`, await p.getByTestId("cart-item").locator("button").evaluateAll(buttons => buttons.every(button => { const bounds = button.getBoundingClientRect(); return bounds.width >= 44 && bounds.height >= 44 })))
    }
    await p.getByRole("button", { name: "Очистить корзину", exact: true }).click()
    await p.getByTestId("empty-cart").waitFor()
    await p.waitForFunction(() => document.querySelector(".texno-cart-count")?.textContent === "0")
    check("real product guest cart cleared without checkout", true)
    check("real cart clean runtime", result.errors.length === 0, result.errors)
    result.products = products
  } catch (error) { result.error = error.message; result.alerts = await p.getByRole("alert").allTextContents() }
  await context.close()
  result.summary = result.checks.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts }, {})
  return result
}
