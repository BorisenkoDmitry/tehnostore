async (page) => {
  await page.unrouteAll({ behavior: "wait" })
  const origin = "http://localhost:9001"
  const folder = "G:/WorkSpace/магазины/tehno-store/commerce/output/playwright"
  const image = "G:/WorkSpace/магазины/tehno-store/commerce/apps/storefront/public/images/about/about-story.webp"
  const slug = `qa-blocknote-${Date.now()}`
  const cases = []
  const files = []
  let article, originalSettings, settingsRevision
  const check = (name, condition = true) => { if (!condition) throw Error(name); cases.push({ name, status: "PASS" }) }
  const document = () => page.getByRole("textbox", { name: "Содержимое статьи", exact: true })
  const apiArticle = async () => {
    const list = await page.request.get(origin + "/admin/content/articles?limit=100")
    const record = (await list.json()).articles.find((entry) => entry.slug === slug)
    if (!record) throw Error("Missing synthetic article")
    const detail = await page.request.get(`${origin}/admin/content/articles/${record.id}`)
    return (await detail.json()).article
  }
  const upload = async (input) => {
    const response = page.waitForResponse((response) => response.url() === origin + "/admin/uploads" && response.request().method() === "POST")
    await input.setInputFiles(image)
    const result = await response
    if (!result.ok()) throw Error("Image upload failed")
    const data = await result.json()
    files.push(...data.files.map((file) => file.id))
    return data.files[0].url
  }
  const dismissNotifications = async () => {
    for (const button of await page.getByRole("region", { name: "Notifications alt+T", exact: true }).getByRole("button").all()) if (await button.isVisible()) await button.click({ timeout: 2000 }).catch(() => {})
  }
  try {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(origin + "/app/content-articles")
    await page.getByRole("button", { name: "Добавить статью", exact: true }).click()
    await page.getByRole("tab", { name: "Карточка", exact: true }).waitFor()
    check("two tabs share a single article form", await page.getByRole("tab", { name: "Статья", exact: true }).count() === 1)
    await page.locator("#article-title").fill("QA: как выбрать смартфон")
    await page.getByRole("textbox", { name: "Адрес статьи (slug)", exact: true }).fill(slug)
    await page.getByRole("textbox", { name: "Краткое описание", exact: true }).fill("Описание карточки со ссылкой на полный материал.")
    const cover = await upload(page.getByLabel("Загрузить: Обложка карточки", { exact: true }))
    await page.getByRole("textbox", { name: "Описание обложки", exact: true }).fill("Обложка тестовой статьи")
    await page.getByText("SEO статьи", { exact: true }).click()
    await page.getByRole("textbox", { name: "SEO-заголовок", exact: true }).fill("SEO отдельной статьи")
    await page.getByRole("textbox", { name: "SEO-описание", exact: true }).fill("SEO-описание отдельного материала")
    await page.locator("#article-title").scrollIntoViewIfNeeded()
    await page.screenshot({ path: folder + "/articles-card-desktop.png", animations: "disabled" })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator("#article-title").scrollIntoViewIfNeeded()
    await page.screenshot({ path: folder + "/articles-card-mobile.png", animations: "disabled" })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole("tab", { name: "Статья", exact: true }).click()
    await document().fill("Первый абзац статьи.")
    await document().press("Control+End")
    await page.keyboard.press("Enter")
    await page.keyboard.type("/")
    await page.getByRole("option", { name: /^Заголовок 2 уровня/ }).click()
    await page.keyboard.type("Что важно при выборе")
    await page.keyboard.press("Enter")
    await page.keyboard.type("/")
    await page.getByRole("option", { name: /^Маркированный список/ }).click()
    await page.keyboard.type("Первый пункт")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Второй пункт")
    await page.keyboard.press("Enter")
    await page.keyboard.press("Enter")
    await page.keyboard.type("/")
    await page.getByRole("option").filter({ hasText: "Картинка" }).click()
    const bodyImage = await upload(page.getByRole("tabpanel", { name: "Загрузить", exact: true }).locator('input[type="file"]'))
    await page.locator(`.article-block-editor img[src="${bodyImage}"]`).waitFor()
    check("BlockNote slash menu inserts headings, lists and uploaded images")
    await document().scrollIntoViewIfNeeded()
    await page.screenshot({ path: folder + "/articles-blocknote-desktop.png", animations: "disabled" })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: folder + "/articles-blocknote-mobile.png", animations: "disabled" })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole("tab", { name: "Карточка", exact: true }).click()
    check("switching tabs preserves card input", await page.locator("#article-title").inputValue() === "QA: как выбрать смартфон")
    await page.getByRole("tab", { name: "Статья", exact: true }).click()
    check("switching tabs preserves rich text", (await document().innerText()).includes("Что важно при выборе"))
    await page.getByRole("button", { name: "Сохранить черновик", exact: true }).click()
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    article = await apiArticle()
    check("card and BlockNote document persist together", article.excerpt === "Описание карточки со ссылкой на полный материал." && article.cover_image === cover && article.body.version === 1 && article.metadata.title === "SEO отдельной статьи")
    check("persisted block types and order match editor", article.body.blocks[0].type === "paragraph" && article.body.blocks.some((block) => block.type === "heading") && article.body.blocks.filter((block) => block.type === "bulletListItem").length === 2 && article.body.blocks.some((block) => block.type === "image" && block.props.url === bodyImage))
    await page.reload()
    await page.getByRole("row").filter({ hasText: slug }).getByRole("button", { name: "Изменить", exact: true }).click()
    await page.locator("#article-title").waitFor()
    check("reopening loads the card description", await page.getByRole("textbox", { name: "Краткое описание", exact: true }).inputValue() === article.excerpt)
    await page.getByRole("tab", { name: "Статья", exact: true }).click()
    check("rich text and image survive full reload", (await document().innerText()).includes("Второй пункт") && await page.locator(`.article-block-editor img[src="${bodyImage}"]`).count() === 1)
    await document().press("Control+End")
    await page.keyboard.type(" Дополнение после повторного открытия.")
    const failure = async (route) => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Тестовая ошибка сохранения" }) }) : route.continue()
    await page.route("**/admin/content/articles/*", failure)
    await page.getByRole("button", { name: "Сохранить черновик", exact: true }).click()
    await page.getByRole("alert").filter({ hasText: "Тестовая ошибка сохранения" }).waitFor()
    check("failed rich-text saves preserve entered content", (await document().innerText()).includes("Дополнение после повторного открытия"))
    await page.unroute("**/admin/content/articles/*", failure)
    await page.getByRole("button", { name: "Сохранить черновик", exact: true }).click()
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    article = await apiArticle()
    check("editing updates the same article revision", article.revision === 2 && JSON.stringify(article.body).includes("Дополнение после повторного открытия"))
    await dismissNotifications()
    originalSettings = (await (await page.request.get(origin + "/admin/content/article-settings")).json()).settings
    await page.getByRole("button", { name: "Настройки страницы", exact: true }).click()
    await page.getByRole("heading", { name: "Настройки страницы «Статьи»", exact: true }).waitFor()
    await page.getByRole("textbox", { name: "Заголовок страницы", exact: true }).fill("Статьи и советы")
    await page.getByRole("textbox", { name: "Вводный текст", exact: true }).fill("Обзоры и советы по выбору техники.")
    await page.getByRole("textbox", { name: "SEO-заголовок", exact: true }).fill("Статьи и советы — Техностор")
    await page.getByRole("textbox", { name: "SEO-описание", exact: true }).fill("Советы и обзоры техники в Техносторе.")
    await page.screenshot({ path: folder + "/articles-page-settings-desktop.png", animations: "disabled" })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: folder + "/articles-page-settings-mobile.png", animations: "disabled" })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole("button", { name: "Сохранить настройки", exact: true }).click()
    await page.getByRole("dialog").waitFor({ state: "hidden" })
    const settings = (await (await page.request.get(origin + "/admin/content/article-settings")).json()).settings
    settingsRevision = settings.revision
    check("index SEO settings save independently of articles", settings.title === "Статьи и советы" && settings.meta_title === "Статьи и советы — Техностор" && settings.meta_description === "Советы и обзоры техники в Техносторе.")
    await page.getByRole("button", { name: "Настройки страницы", exact: true }).click()
    await page.locator("#articles-page-title").waitFor()
    check("reopening settings loads current saved data", await page.getByRole("textbox", { name: "SEO-заголовок", exact: true }).inputValue() === settings.meta_title)
    await page.getByRole("button", { name: "Отмена", exact: true }).click()
    return { slug, cases }
  } finally {
    await page.unrouteAll({ behavior: "wait" })
    const list = await page.request.get(origin + "/admin/content/articles?limit=100")
    if (list.ok()) for (const item of (await list.json()).articles.filter((entry) => entry.slug === slug)) {
      if (!(await page.request.delete(`${origin}/admin/content/articles/${item.id}?expected_revision=${item.revision}`)).ok()) throw Error("Synthetic article cleanup failed")
    }
    for (const file of files) if (!(await page.request.delete(`${origin}/admin/uploads/${file}`)).ok()) throw Error("Synthetic image cleanup failed")
    if (originalSettings && settingsRevision !== undefined) {
      const { revision: _revision, ...settings } = originalSettings
      if (!(await page.request.post(origin + "/admin/content/article-settings", { data: { ...settings, expected_revision: settingsRevision } })).ok()) throw Error("Settings restoration failed")
    }
  }
}
