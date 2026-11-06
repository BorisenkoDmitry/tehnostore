async page => {
  const origin = new URL(page.url()).origin
  const navigateHome = () => page.goto(`${origin}/se`)
  const currentSlide = () => page.locator(".texno-slide.is-active").getAttribute("id")
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  const results = {}

  await navigateHome()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => scrollTo(0, 0))
  for (let index = 0; index < 4; index++) {
    await page.locator(".texno-slide-controls button").nth(index).click()
    await page.waitForSelector(`#hero-slide-${index}.is-active:not(.is-entering)`)
    const bounds = await page.locator(`#hero-slide-${index}`).evaluate((slide) => {
      const artwork = slide.querySelector("picture").getBoundingClientRect()
      const header = document.querySelector(".texno-header").getBoundingClientRect()
      const copy = slide.querySelector(".texno-hero-content").getBoundingClientRect()
      return { belowHeader: artwork.top >= header.bottom, besideText: artwork.left >= copy.right, overflow: document.documentElement.scrollWidth > innerWidth }
    })
    check(bounds.belowHeader && bounds.besideText && !bounds.overflow, `Slide ${index} overlaps the navigation or text`)
  }
  results.desktopSlides = 4
  check(await page.locator("h1").count() === 1, "Homepage must have one H1")
  check(await page.locator(".texno-hero clipPath").count() === 0, "Legacy JS SVG mask remains")
  check(await page.locator(".texno-slide-title").evaluateAll((headings) => headings.every((heading) => !heading.textContent.trim().endsWith("."))), "Heading ends with a period")

  await page.setViewportSize({ width: 375, height: 600 })
  await page.locator(".texno-buy-button").first().click()
  const close = page.getByRole("button", { name: "Закрыть карточку" })
  const before = await close.boundingBox()
  const scrolled = await page.locator(".texno-product-dialog-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; return element.scrollTop })
  const after = await close.boundingBox()
  check(scrolled > 0 && Math.abs(before.y - after.y) < 1, "Close button moves with dialog content")
  const actions = await page.locator(".texno-preview-actions").evaluate((element) => ({ direction: getComputedStyle(element).flexDirection, widths: [...element.children].map((child) => child.clientWidth), width: element.clientWidth }))
  check(actions.direction === "column" && actions.widths.every((width) => width === actions.width), "Mobile popup buttons are not full-width stacked")
  await page.getByRole("button", { name: "Продолжить покупки" }).click()
  check(!await page.locator("dialog").isVisible(), "Continue shopping did not close dialog")
  results.popup = "passed"

  await page.setViewportSize({ width: 390, height: 844 })
  const reviews = await page.locator(".texno-reviews .texno-review-grid").evaluate((element) => ({ viewport: element.clientWidth, card: element.firstElementChild.clientWidth, scroll: element.scrollWidth }))
  check(reviews.viewport === reviews.card && reviews.scroll > reviews.viewport, "Mobile reviews are not one-card scrollable")
  check((await page.getByRole("link", { name: "Все отзывы", exact: true }).getAttribute("href")).endsWith("/page/reviews"), "All reviews does not link to its page")
  results.reviews = "passed"

  await page.evaluate(() => scrollTo(0, 0))
  await page.locator(".texno-slide-controls button").first().click()
  await page.waitForSelector("#hero-slide-0.is-active:not(.is-entering)")
  await page.evaluate(async () => {
    const start = performance.now()
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        scrollTo(0, 100 + Math.sin((performance.now() - start) / 100) * 60)
        if (performance.now() - start >= 8200) { clearInterval(timer); resolve() }
      }, 100)
    })
  })
  check(await currentSlide() === "hero-slide-0", "Autoplay interrupted continuous scrolling")
  await page.waitForSelector("#hero-slide-1.is-active", { timeout: 3000 })
  results.scrollAwareAutoplay = "passed"

  for (const [path, selector, expected] of [
    ["/se/catalog", ".texno-product-card", 6],
    ["/se/page/reviews", ".texno-review-card", 9],
  ]) {
    const response = await page.goto(`${origin}${path}`)
    check(response.status() === 200, `Route failed: ${path}`)
    check(await page.locator(selector).count() === expected, `Incorrect content count: ${path}`)
  }
  results.routes = "passed"
  await navigateHome()
  return results
}
