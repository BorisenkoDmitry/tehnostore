async page => {
  const f = __FIXTURE__
  const admin = __ADMIN_ORIGIN__, store = __STORE_ORIGIN__
  const cases = [], pageErrors = []
  let browserAction = "startup"
  const check = (id, pass, evidence = {}) => cases.push({ id, status: pass ? "PASS" : "FAIL", ...evidence })
  const safe = value => String(value).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]").replace(/([?&](?:preview|token|capability)=)[^&\s]+/gi, "$1[REDACTED]").split("\n")[0].slice(0, 250)
  const stage = async (id, fn) => { try { await fn() } catch (error) { cases.push({ id, status: "BLOCKED", reason: safe(`${browserAction}: ${error.message}`) }) } }
  const allowed = new Set([admin, store, __HMR_ORIGIN__])
  await page.context().route("**/*", route => allowed.has(new URL(route.request().url()).origin) ? route.continue() : route.abort())
  const onError = error => pageErrors.push(safe(error.message))
  page.on("pageerror", onError)
  page.setDefaultTimeout(20000)
  await page.goto(admin + "/app/login", { waitUntil: "domcontentloaded" })
  await page.getByRole("textbox").first().fill(__ADMIN_EMAIL__)
  await page.locator("input[type=password]").fill(__ADMIN_PASSWORD__)
  await page.getByRole("button", { name: /Continue|Log in|Sign in|Войти|Продолжить/i }).click()
  await page.waitForURL(url => !url.pathname.includes("/login"))
  const preview = async id => {
    // Fetch from Chromium so the special *.localhost cookie/origin handling
    // stays in the browser. Node's APIRequestContext cannot resolve this host
    // reliably on Windows.
    const result = await page.evaluate(async url => {
      const response = await fetch(url, { credentials: "include" })
      return { status: response.status, body: await response.json() }
    }, admin + "/admin/orders/" + id + "/preview")
    if (result.status !== 200) throw Error("Preview HTTP " + result.status)
    return result.body.order
  }
  await stage("F13-preview-country-browser", async () => {
    await page.goto(admin + "/app/content-pages")
    const row = page.getByRole("row").filter({ hasText: f.draft.title })
    await row.getByRole("button", { name: "Предпросмотр", exact: true }).click()
    const link = page.getByRole("link", { name: "Открыть на витрине", exact: true })
    const href = new URL(await link.getAttribute("href"))
    check("F13-preview-link-profile-country", href.pathname === `/${f.country}/page/${f.draft.slug}`, { path: href.pathname })
    const popupPromise = page.waitForEvent("popup")
    await link.click()
    const popup = await popupPromise
    await popup.waitForLoadState("domcontentloaded")
    check("F13-preview-actually-opens", new URL(popup.url()).pathname === href.pathname && await popup.getByText("Synthetic preview", { exact: true }).isVisible())
    await popup.close()
  })
  await stage("F14-contact-consent-browser-submit", async () => {
    await page.goto(store + `/${f.country}/page/contacts`)
    const form = page.locator("form").filter({ has: page.locator("#contacts-message") })
    check("F14-contact-uses-configured-privacy", await form.locator(`a[href="/${f.country}/page/${f.legal.privacy}"]`).count() === 1)
    check("F14-contact-uses-configured-consent", await form.locator(`a[href="/${f.country}/page/${f.legal.consent}"]`).count() === 1)
    await page.locator("#contacts-name").fill("Synthetic UI")
    await page.locator("#contacts-email").fill("ui-" + f.fixtureRunId + "@example.test")
    await page.locator("#contacts-message").fill("Synthetic contact UI " + f.fixtureRunId)
    await form.locator("input[type=checkbox]").check()
    await form.getByRole("button", { name: "Отправить обращение", exact: true }).click()
    await page.getByText(/Обращение сохранено/).waitFor()
    check("F14-contact-real-submit-saved", true)
  })
  await stage("F17-csv-error-browser-submit", async () => {
    const errorStart = pageErrors.length
    await page.goto(admin + "/app/products/import")
    await page.locator("input[type=file]").waitFor({ state: "attached" })
    const malformedResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/admin/products/imports" && response.request().method() === "POST")
    await page.locator("input[type=file]").setInputFiles({ name: "malformed.csv", mimeType: "text/csv", buffer: Buffer.from('Product Handle,Product Title\n"unterminated') })
    const rejected = await malformedResponse
    check("F17-malformed-csv-http-400", rejected.status() === 400, { http: rejected.status() })
    await page.locator("input[type=file]").waitFor({ state: "attached" })
    const validResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/admin/products/imports" && response.request().method() === "POST")
    const csv = `Product Id,Product Handle,Product Title,Product Status\n${f.product.id},${f.product.handle},UI remediation ${f.fixtureRunId},published\n`
    await page.locator("input[type=file]").setInputFiles({ name: "valid.csv", mimeType: "text/csv", buffer: Buffer.from(csv) })
    const accepted = await validResponse
    check("F17-valid-csv-preview-after-rejection", accepted.status() === 202, { http: accepted.status() })
    await page.getByRole("button", { name: /^Cancel$|^Отмена$/ }).click()
    await page.waitForURL(url => !url.pathname.endsWith("/import"))
    check("F17-no-unhandled-browser-error", pageErrors.length === errorStart, { errors: pageErrors.slice(errorStart) })
  })
  // Slow preview responses make the cancel/confirm invalidation race repeatable.
  await page.route("**/admin/orders/*/preview*", async route => { await new Promise(resolve => setTimeout(resolve, 90)); await route.continue() })
  for (const [kind, route, cancelName, confirmName] of [["edit", "edits", /^Cancel Edit$|^Отменить редактирование$/, null], ["exchange", "exchanges", null, /^Confirm Exchange$|^Подтвердить обмен$/], ["claim", "claims", null, /^Confirm Claim$|^Подтвердить претензию$/]]) {
    await stage("F12-" + kind + "-twenty-browser-races", async () => {
      const order = f.orders[kind]
      const rounds = kind === "edit" ? 20 : 1
      for (let round = 1; round <= rounds; round++) {
        browserAction = `${kind} ${round}/${rounds}: open route`
        let beginCalls = 0
        const listener = response => {
          const pathname = new URL(response.url()).pathname
          if (response.request().method() === "POST" && ["/admin/order-edits", "/admin/exchanges", "/admin/claims"].includes(pathname)) beginCalls++
        }
        page.on("response", listener)
        try {
          await page.goto(`${admin}/app/orders/${order.id}/${route}`, { waitUntil: "domcontentloaded" })
          if (kind === "edit") {
            await page.getByRole("button", { name: cancelName }).last().waitFor()
            if (round % 5 === 0) { await page.reload(); await page.getByRole("button", { name: cancelName }).last().waitFor() }
            await page.getByRole("button", { name: cancelName }).last().click()
          } else {
            browserAction = `${kind} ${round}/${rounds}: open inbound items`
            await page.getByText("Add items", { exact: true }).first().click()
            browserAction = `${kind} ${round}/${rounds}: select inbound item`
            await page.getByRole("checkbox").last().check()
            browserAction = `${kind} ${round}/${rounds}: save inbound items`
            await page.getByRole("button", { name: /^Save$|^Сохранить$/ }).click()
            const inbound = page.locator('input[name="inbound_items.0.quantity"]')
            browserAction = `${kind} ${round}/${rounds}: set inbound quantity`
            await inbound.waitFor(); await inbound.fill("1"); await inbound.blur()
            const location = page.locator("input[name=location_id]")
            browserAction = `${kind} ${round}/${rounds}: select location`
            await location.fill(f.locationName)
            await page.getByRole("option", { name: f.locationName, exact: true }).click()
            browserAction = `${kind} ${round}/${rounds}: open replacement items`
            await page.getByText("Add items", { exact: true }).last().click()
            browserAction = `${kind} ${round}/${rounds}: search replacement item`
            await page.getByRole("searchbox").fill(f.product.variants[1].sku)
            browserAction = `${kind} ${round}/${rounds}: select replacement item`
            await page.getByRole("row").filter({ hasText: f.product.variants[1].sku }).getByRole("checkbox").check()
            browserAction = `${kind} ${round}/${rounds}: save replacement items`
            await page.getByRole("button", { name: /^Save$|^Сохранить$/ }).click()
            await page.locator('input[name="outbound_items.0.quantity"]').waitFor()
            browserAction = `${kind} ${round}/${rounds}: set replacement quantity`
            await page.locator('input[name="outbound_items.0.quantity"]').fill("1")
            await page.locator('input[name="outbound_items.0.quantity"]').blur()
            const outbound = page.locator("input[name=outbound_option_id]")
            browserAction = `${kind} ${round}/${rounds}: choose delivery option`
            await outbound.fill(f.shippingOptionName || "Самовывоз")
            await page.getByRole("option").first().click()
            const notify = page.getByRole("switch", { name: /^Send notification$|^Отправить уведомление$/ })
            if (await notify.isChecked()) await notify.uncheck()
            browserAction = `${kind} ${round}/${rounds}: open confirm dialog`
            await page.getByRole("button", { name: confirmName }).click()
            const completed = page.waitForResponse(response => response.request().method() === "POST" && new RegExp(`/admin/${route}/[^/]+/request$`).test(new URL(response.url()).pathname))
            browserAction = `${kind} ${round}/${rounds}: submit operation`
            await page.getByRole("alertdialog").getByRole("button", { name: /^Continue$|^Продолжить$/ }).click()
            const response = await completed
            check(`F12-${kind}-${round}-submit`, response.status() === 200, { http: response.status() })
          }
          await page.waitForURL(url => url.pathname === `/app/orders/${order.id}`)
          await page.waitForTimeout(700)
          const result = await preview(order.id)
          check(`F12-${kind}-${round}-no-phantom`, !result.order_change && beginCalls <= 1, { pending: result.order_change ? { id: result.order_change.id, type: result.order_change.change_type, status: result.order_change.status } : null, begin_calls: beginCalls })
          if (result.order_change) throw Error("Pending phantom draft remains; no manual cleanup performed")
        } finally { page.off("response", listener) }
      }
    })
  }
  await stage("F16-clear-then-select-other-cart-browser", async () => {
    const email = "buyer-" + f.fixtureRunId + "@example.test"
    const password = "Synthetic-" + crypto.randomUUID()
    const productUrl = `${store}/${f.country}/products/${f.product.handle}?v_id=${f.product.variants[1].id}`
    const add = async () => { await page.goto(productUrl); await page.getByTestId("add-product-button").click(); await page.getByText(/Товар в корзине/).waitFor() }
    browserAction = "F16 add as guest"
    await add()
    browserAction = "F16 open account"
    await page.goto(`${store}/${f.country}/account`)
    browserAction = "F16 open registration"
    await page.getByTestId("register-button").first().click()
    await page.getByTestId("register-page").waitFor()
    check("F14-registration-consent-uses-configured-slug", await page.locator(`a[href="/${f.country}/page/${f.legal.consent}"]`).count() === 1)
    await page.getByTestId("first-name-input").fill("Synthetic")
    await page.getByTestId("last-name-input").fill("Buyer")
    browserAction = "F16 fill login email after logout"
    await page.getByTestId("email-input").last().fill(email)
    await page.getByTestId("password-input").last().fill(password)
    await page.locator('input[name="consent"]').check()
    await page.getByTestId("register-page").getByTestId("register-button").click()
    await page.getByTestId("account-nav").waitFor()
    check("F16-real-registration", true)
    await page.goto(`${store}/${f.country}/account/profile`)
    await page.getByTestId("logout-button").click()
    await page.waitForTimeout(500)
    const signedInCookie = (await page.context().cookies(store)).some(cookie => cookie.name === "_medusa_jwt")
    check("F16-logout-clears-auth-cookie", !signedInCookie)
    // Keep the following scenario independent of a stale browser cookie if the
    // logout server action did not complete in this run. The failed logout
    // assertion remains visible; cookie reset only creates a guest fixture.
    if (signedInCookie) await page.context().clearCookies({ name: "_medusa_jwt" })
    await page.context().clearCookies({ name: "_medusa_cart_id" })
    await page.context().clearCookies({ name: "_texno_cart_token" })
    browserAction = "F16 guest account navigation"
    await page.goto(`${store}/${f.country}/account`)
    await page.getByTestId("account-page").waitFor()
    const loginPages = await page.getByTestId("login-page").count()
    const accountNavs = await page.getByTestId("account-nav").count()
    check("F16-signed-out-renders-login", loginPages > 0 && accountNavs === 0, { login_pages: loginPages, account_navs: accountNavs })
    if (!loginPages || accountNavs) throw Error("Storefront account did not render guest login after logout")
    browserAction = "F16 add guest product after logout"
    await add()
    browserAction = "F16 open login with guest cart"
    await page.goto(`${store}/${f.country}/account`)
    browserAction = "F16 fill sign-in credentials"
    await page.getByTestId("email-input").last().fill(email)
    await page.getByTestId("password-input").last().fill(password)
    browserAction = "F16 submit sign-in"
    await page.getByTestId("sign-in-button").click()
    browserAction = "F16 wait for signed-in account"
    await page.getByTestId("account-nav").waitFor()
    browserAction = "F16 open cart with two choices"
    await page.goto(`${store}/${f.country}/cart`)
    const choices = page.getByRole("button", { name: /Проверить корзину/ })
    await choices.first().waitFor()
    check("F14-checkout-consent-uses-configured-slug", await page.locator(`a[href="/${f.country}/page/${f.legal.consent}"]`).count() >= 1)
    check("F16-conflict-has-two-choices", await choices.count() === 2)
    await page.getByRole("button", { name: "Очистить корзину", exact: true }).click()
    await page.getByTestId("empty-cart").waitFor()
    check("F16-empty-cart-keeps-saved-choices", await choices.count() === 2)
    const activeId = (await page.context().cookies(store)).find((cookie) => cookie.name === "_medusa_cart_id")?.value
    if (!activeId) throw Error("Missing active-cart identity")
    await page.locator(`button[data-cart-id]:not([data-cart-id="${activeId}"])`).first().click()
    await page.getByTestId("cart-item").first().waitFor()
    check("F16-selects-other-saved-cart-without-login", await page.getByTestId("cart-item").count() === 1)
  })
  page.off("pageerror", onError)
  check("UI-no-page-errors", pageErrors.length === 0, { errors: pageErrors })
  return { project: f.project, fixtureRunId: f.fixtureRunId, source_manifest_sha256: f.source_manifest_sha256, orders: f.orders, cases }
}
