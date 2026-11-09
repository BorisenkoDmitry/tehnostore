async (page) => {
  const result = { generated_at: new Date().toISOString(), checks: [], errors: [] }
  const check = (name, passed, evidence) => result.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence })
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
  page.setDefaultTimeout(20000)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const response = await page.goto("http://localhost:8000/dk/products/texno-example-212752287", { waitUntil: "domcontentloaded" })
  await page.getByTestId("product-title").waitFor()
  await page.locator(".texno-shell.is-hydrated").waitFor()
  check("PDP direct load", response?.status() === 200, { title: await page.getByTestId("product-title").innerText() })
  await page.getByRole("radio", { name: "Silver - Серебристый", exact: true }).click()
  await page.getByTestId("product-title").filter({ hasText: "256GB Silver" }).waitFor()
  const selectedColor = { url: page.url(), title: await page.getByTestId("product-title").innerText() }
  check("color changes actual product route and variant", !selectedColor.url.includes("texno-example-212752287") && new URL(selectedColor.url).searchParams.has("v_id"), selectedColor)
  await page.getByRole("radio", { name: "64 ГБ", exact: true }).click()
  await page.getByTestId("product-title").filter({ hasText: "64GB Silver" }).waitFor()
  const selectedMemory = { url: page.url(), title: await page.getByTestId("product-title").innerText() }
  check("memory changes actual selected product and retains color", selectedMemory.url !== selectedColor.url && new URL(selectedMemory.url).searchParams.has("v_id"), selectedMemory)
  await page.reload({ waitUntil: "domcontentloaded" })
  await page.getByTestId("product-title").filter({ hasText: "64GB Silver" }).waitFor()
  check("selection survives reload", await page.getByRole("radio", { name: "Silver - Серебристый", exact: true }).isChecked() && await page.getByRole("radio", { name: "64 ГБ", exact: true }).isChecked(), page.url())
  await page.getByRole("tab", { name: "Описание", exact: true }).click()
  check("rich description remains available", await page.getByTestId("product-description").locator("h3").count() === 2, { headings: await page.getByTestId("product-description").locator("h3").allTextContents() })
  await page.getByRole("tab", { name: "Характеристики", exact: true }).click()
  check("tab semantics retain selected state", await page.getByRole("tab", { name: "Характеристики", exact: true }).getAttribute("aria-selected") === "true")
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      header: document.querySelector(".texno-header-inner")?.getBoundingClientRect().toJSON(),
      product: document.querySelector("article")?.getBoundingClientRect().toJSON(),
      overlay: [...document.querySelectorAll("nextjs-portal")].some(el => /Runtime Error|Unhandled Runtime|fetch failed/.test(el.shadowRoot?.textContent ?? "")),
    }))
    check(`PDP ${width}px no overflow or runtime overlay`, !geometry.overflow && !geometry.overlay, geometry)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole("navigation", { name: "Хлебные крошки" }).getByRole("link", { name: "Каталог", exact: true }).click()
  await page.waitForURL("**/dk/store")
  await page.locator('.texno-store-results[aria-busy="false"]').waitFor()
  const search = page.getByRole("searchbox", { name: "Поиск по каталогу" })
  await search.fill("iPhone 11 Pro")
  await page.waitForURL("**q=iPhone+11+Pro**")
  await page.locator('.texno-store-results[aria-busy="false"]').waitFor()
  check("catalog search works after PDP navigation", await page.locator('.texno-store-results a[href*="/products/"]').count() > 0, { url: page.url() })
  await page.getByRole("button", { name: "Сбросить всё", exact: true }).click()
  await page.locator('.texno-store-results[aria-busy="false"]').waitFor()
  check("catalog reset works", !new URL(page.url()).searchParams.has("q"))
  result.errors = errors
  check("PDP and catalog no uncaught or console errors", errors.length === 0, errors)
  return result
}
