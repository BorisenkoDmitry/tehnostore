async page => {
  const functional = __FUNCTIONAL__
  const errors = []
  const searchRequests = []
  const prefetchRequests = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("request", request => {
    if (request.url().includes("/store/search")) searchRequests.push(request.url())
    if (["1", "2", "3"].includes(request.headers()["next-router-prefetch"])) {
      prefetchRequests.push(new URL(request.url()).pathname)
    }
  })
  await page.context().route("**/*", route => ["http://localhost:8100", "http://localhost:9100"].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort())
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    window.__firstCatalogProducts = null
    const observer = new MutationObserver(() => {
      if (Array.from(document.querySelectorAll(".texno-store-results .texno-product-card h3")).some(card => card.getClientRects().length > 0)) { window.__firstCatalogProducts = performance.now(); observer.disconnect() }
    })
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"] })
  })
  const runs = []
  let serverCards = 0
  for (let i = 0; i < 5; i++) {
    const response = await page.goto("http://localhost:8100/ru/store", { waitUntil: "domcontentloaded" })
    const html = await response.text()
    serverCards = await page.evaluate(html => new DOMParser().parseFromString(html, "text/html").querySelectorAll(".texno-store-results .texno-product-card h3").length, html)
    await page.waitForFunction(() => document.querySelectorAll(".texno-store-results .texno-product-card").length === 12 && document.querySelector(".texno-store-results")?.getAttribute("aria-busy") === "false")
    runs.push(await page.evaluate(() => ({ first_products_ms: window.__firstCatalogProducts, ttfb_ms: performance.getEntriesByType("navigation")[0].responseStart })))
  }
  const cases = []
  if (functional) {
    cases.push({ name: "SSR contains all 12 cards without JavaScript", pass: serverCards === 12 })
    cases.push({ name: "Hydration reuses SSR results without a duplicate browser search", pass: searchRequests.length === 0, requests: searchRequests.length })
    await page.getByRole("button", { name: /^Сортировка:/ }).click()
    await page.getByRole("option", { name: "Сначала дешевле", exact: true }).click()
    await page.waitForFunction(() => new URL(location.href).searchParams.get("sort") === "price_asc" && document.querySelector(".texno-store-results")?.getAttribute("aria-busy") === "false")
    const prices = await page.locator(".texno-store-results .texno-product-prices > span").allTextContents()
    const amounts = prices.filter((price) => /\d/.test(price)).map((price) => Number(price.replace(/[^\d]/g, "")))
    cases.push({ name: "Price sorting remains ordered", pass: amounts.length > 0 && amounts.every((value, index) => index === 0 || value >= amounts[index - 1]) })
    const categoryResponse = await page.goto("http://localhost:8100/ru/store?category=apple-iphone", { waitUntil: "domcontentloaded" })
    const categoryCards = await page.evaluate(html => new DOMParser().parseFromString(html, "text/html").querySelectorAll(".texno-store-results .texno-product-card h3").length, await categoryResponse.text())
    await page.locator("#store-title:visible").waitFor()
    cases.push({ name: "Saved category URL renders its first result on the server", pass: categoryCards === 12 && /Apple iPhone/i.test(await page.locator("#store-title:visible").textContent()) })
    await page.goto("http://localhost:8100/ru/store", { waitUntil: "domcontentloaded" })
    await page.getByRole("searchbox", { name: "Поиск по каталогу" }).fill("zzzz-no-product-performance-123")
    await page.getByRole("searchbox", { name: "Поиск по каталогу" }).press("Enter")
    await page.getByRole("heading", { name: "Товары не найдены" }).waitFor()
    cases.push({ name: "Search preserves the empty-results state", pass: true })
    await page.getByRole("searchbox", { name: "Поиск по каталогу" }).fill("")
    await page.getByRole("searchbox", { name: "Поиск по каталогу" }).press("Enter")
    await page.waitForFunction(() => document.querySelectorAll(".texno-store-results .texno-product-card").length === 12 && document.querySelector(".texno-store-results")?.getAttribute("aria-busy") === "false")
    await page.getByRole("button", { name: "Далее", exact: true }).click()
    await page.waitForFunction(() => new URL(location.href).searchParams.get("page") === "2" && document.querySelector(".texno-store-results")?.getAttribute("aria-busy") === "false")
    cases.push({ name: "Pagination loads the next result page", pass: true })
    await page.goBack({ waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => !new URL(location.href).searchParams.has("page") && document.querySelector(".texno-store-results")?.getAttribute("aria-busy") === "false")
    cases.push({ name: "Back navigation restores the first page", pass: true })
    const href = await page.locator(".texno-store-results .texno-product-card h3 a").first().getAttribute("href")
    await page.goto("http://localhost:8100" + href, { waitUntil: "domcontentloaded" })
    await page.getByTestId("product-container").waitFor()
    cases.push({ name: "Product detail opens after catalog navigation", pass: true })
    await page.getByTestId("product-container").getByRole("link", { name: "Каталог", exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll(".texno-store-results .texno-product-card h3").length === 12 && document.querySelector(".texno-store-results")?.getAttribute("aria-busy") === "false")
    cases.push({ name: "Client navigation from a product to the catalog still loads results", pass: true })
    await page.setViewportSize({ width: 390, height: 844 })
    const response = await page.goto("http://localhost:8100/ru/store?page=2", { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => document.querySelectorAll(".texno-store-results .texno-product-card").length === 12)
    cases.push({ name: "Mobile SSR honors page parameters without overflow", pass: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && new URL(location.href).searchParams.get("page") === "2") })
    await page.screenshot({ path: "output/playwright/catalog-performance-mobile.png", fullPage: false })
  }
  return { runs, server_cards: serverCards, cases, errors, prefetch_requests: prefetchRequests }
}
