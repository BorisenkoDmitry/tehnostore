async (page) => {
  const origin = new URL(page.url()).origin
  const searches = []
  const prefetches = []
  const actions = []
  const checks = []
  const timings = []
  const check = (name, passed) => {
    if (!passed) throw Error(name)
    checks.push(name)
  }
  const capture = (request) => {
    const url = new URL(request.url())
    if (url.pathname === "/store/search") searches.push(request.postDataJSON())
    if (request.headers()["next-router-prefetch"] === "1") prefetches.push(url.pathname)
    if (request.headers()["next-action"]) actions.push(url.pathname)
  }
  const ready = () => page.waitForFunction(() =>
    document.querySelector(".texno-store-results")?.getAttribute("aria-busy") === "false")
  const choose = async (group, label) => {
    const before = searches.length
    const start = Date.now()
    await page.getByRole("group", { name: group, exact: true }).getByRole("button", { name: label, exact: true }).click()
    await ready()
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    timings.push({ group, label, ms: Date.now() - start, requests: searches.length - before })
    return searches.slice(before)
  }
  const onlyProducts = (requests) => requests.length === 1 && requests[0].queries.length === 1 &&
    requests[0].queries[0].pagination.take > 0 && !requests[0].queries[0].search_options.facets

  page.on("request", capture)
  try {
    await page.setViewportSize({ width: 1440, height: 1000 })
    const response = await page.goto(origin + "/ru/store", { waitUntil: "domcontentloaded" })
    const serverCards = await page.evaluate((html) => new DOMParser().parseFromString(html, "text/html")
      .querySelectorAll(".texno-store-results .texno-product-card h3").length, await response.text())
    await ready()
    await page.waitForTimeout(700)
    check("SSR contains 12 product cards", serverCards === 12)
    check("Hydration reuses both initial search results", searches.length === 0)
    check("Catalog links do not prefetch routes", prefetches.length === 0)

    check("Color requests only products", onlyProducts(await choose("Цвет", "Blue - Синий")))
    check("Memory requests only products", onlyProducts(await choose("Объем встроенной памяти", "128 Гб")))
    check("Previous selection is served from the product cache", (await choose("Объем встроенной памяти", "128 Гб")).length === 0)
    check("Diagonal reuses the available-filter cache", onlyProducts(await choose("Диагональ", '6.1"')))

    const beforeFocus = searches.length
    await page.waitForTimeout(16_000)
    const refreshed = page.waitForResponse((response) => response.url().includes("/store/search") && response.request().method() === "POST")
    await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    await refreshed
    await ready()
    check("Expired products refresh while facets remain fresh", onlyProducts(searches.slice(beforeFocus)))

    let fail = true
    await page.route("**/store/search", (route) => {
      if (fail) {
        fail = false
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Catalog cache QA" }) })
      }
      return route.continue()
    })
    await page.getByRole("group", { name: "Цвет", exact: true }).getByRole("button", { name: "Black - Черный", exact: true }).click()
    await page.getByRole("heading", { name: "Не удалось загрузить товары", exact: true }).waitFor()
    await page.unroute("**/store/search")
    const beforeRetry = searches.length
    await page.getByRole("button", { name: "Попробовать снова", exact: true }).click()
    await ready()
    check("Explicit retry reloads failed data and facets", searches.length - beforeRetry === 2)

    await page.goto(origin + "/ru/store", { waitUntil: "domcontentloaded" })
    await ready()
    const beforeCategory = searches.length
    await page.getByRole("button", { name: "Apple iPhone", exact: true }).first().click()
    check("Opening a category group does not reload products", searches.length === beforeCategory)
    await page.getByRole("button", { name: "Все Apple iPhone", exact: true }).click()
    await ready()
    const categoryRequests = searches.slice(beforeCategory)
    check("A different category gets its own products and facets", categoryRequests.length === 2 &&
      categoryRequests.some((request) => request.queries[0].search_options.facets))

    const beforeBack = searches.length
    await page.goBack()
    await page.waitForFunction(() => !new URL(location.href).searchParams.has("category") &&
      document.querySelector(".texno-store-results")?.getAttribute("aria-busy") === "false")
    check("Back navigation reuses the previous category cache", searches.length === beforeBack)

    const beforePage = searches.length
    await page.getByRole("button", { name: "Далее", exact: true }).click()
    await ready()
    check("Pagination reuses facets", onlyProducts(searches.slice(beforePage)))
    await page.waitForTimeout(700)
    check("Filtering and pagination do not prefetch product pages", prefetches.length === 0)
    check("Catalog requests do not invoke locale Server Actions", actions.length === 0)

    await page.setViewportSize({ width: 390, height: 844 })
    const mobile = await page.goto(origin + "/ru/store?page=2", { waitUntil: "domcontentloaded" })
    await ready()
    check("Mobile catalog preserves SSR and page state", mobile.ok() && await page.evaluate(() =>
      document.querySelectorAll(".texno-store-results .texno-product-card").length === 12 &&
      new URL(location.href).searchParams.get("page") === "2" && document.documentElement.scrollWidth <= innerWidth))

    return { checks, timings, prefetches: prefetches.length, localeActions: actions.length }
  } finally {
    page.off("request", capture)
    await page.unroute("**/store/search")
  }
}
