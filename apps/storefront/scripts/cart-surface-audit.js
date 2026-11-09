async (page) => {
  const results = { generated_at: new Date().toISOString(), checks: [], surfaces: [], errors: [] }
  const check = (name, passed, evidence) => results.checks.push({ name, status: passed ? "PASS" : "FAIL", evidence })
  const browser = page.context().browser()
  for (const [device, width, height] of [["narrow", 320, 800], ["mobile", 390, 844], ["tablet", 768, 1024], ["desktop", 1440, 1000]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" })
    const p = await context.newPage()
    const errors = []
    p.on("pageerror", error => errors.push(error.message))
    p.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
    const response = await p.goto("http://localhost:8000/dk/cart", { waitUntil: "domcontentloaded" })
    await p.locator("h1").first().waitFor()
    await p.waitForTimeout(500)
    const surface = await p.evaluate(() => ({
      title: document.title,
      h1: [...document.querySelectorAll("h1")].map(el => el.textContent),
      overflow: document.documentElement.scrollWidth > innerWidth,
      cart_count: document.querySelector(".texno-cart-count")?.textContent,
      named_links: [...document.querySelectorAll("main a")].filter(el => el.getClientRects().length && !(el.textContent?.trim() || el.getAttribute("aria-label") || el.querySelector("img[alt]")?.getAttribute("alt"))).length,
      empty_hrefs: [...document.querySelectorAll("main a")].filter(el => el.getAttribute("href") === "#").length,
      unlabeled_inputs: [...document.querySelectorAll("main input,main select,main textarea")].filter(el => el.type !== "hidden" && !el.labels?.length && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")).map(el => ({ name: el.name, type: el.type })),
      overlay: [...document.querySelectorAll("nextjs-portal")].some(el => /Runtime Error|Unhandled Runtime|fetch failed/.test(el.shadowRoot?.textContent ?? "")),
      infinite_animations: document.getAnimations().filter(animation => animation.effect?.getTiming().iterations === Infinity).length,
    }))
    results.surfaces.push({ device, width, height, status: response?.status(), ...surface, errors })
    check(`${device}: HTTP 200 and Russian cart title`, response?.status() === 200 && surface.h1.some(title => /корзин/i.test(title)), surface.h1)
    check(`${device}: no horizontal overflow or error overlay`, !surface.overflow && !surface.overlay, { overflow: surface.overflow, overlay: surface.overlay })
    check(`${device}: controls and links have accessible names`, surface.unlabeled_inputs.length === 0 && surface.named_links === 0, { unlabeled_inputs: surface.unlabeled_inputs, unnamed_links: surface.named_links })
    check(`${device}: no placeholder anchor href`, surface.empty_hrefs === 0, surface.empty_hrefs)
    check(`${device}: clean runtime`, errors.length === 0, errors)
    await p.screenshot({ path: `G:/WorkSpace/магазины/tehno-store/commerce/output/cart-qa-empty-${device}.png`, fullPage: true, animations: "disabled" })
    await context.close()
  }
  return results
}
