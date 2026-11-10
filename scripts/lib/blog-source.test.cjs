const { test } = require("node:test")
const assert = require("node:assert/strict")
const { listing, article } = require("./blog-source.cjs")
const base = "https://texno.store/blogs/blog/example"

test("extracts actual cards and pagination without navigation or script lookalikes", () => {
  const page = listing(`<html><head><title>Блог &amp; советы</title><meta name="description" content="Описание"></head><body><a href="/blogs/blog/not-a-card">Меню</a><div class="blog-card"><a class="cover" href="/blogs/blog/one"><img src="//cdn.example.test/one.jpg" alt="Обложка"></a><div class="title"><a href="/blogs/blog/one">Статья &amp; обзор</a></div><div class="date">01.11.2026</div><div class="announce">Описание <b>карточки</b>.</div></div><a href="/blogs/blog?page=13">13</a></body></html>`, "https://texno.store/blogs/blog")
  assert.equal(page.last_page, 13)
  assert.equal(page.cards.length, 1)
  assert.equal(page.cards[0].url, "https://texno.store/blogs/blog/one")
  assert.equal(page.cards[0].title, "Статья & обзор")
  assert.equal(page.cards[0].cover.url, "https://cdn.example.test/one.jpg")
  assert.equal(page.metadata.description, "Описание")
})

test("preserves article order, nested lists, images, links and tables outside theme chrome", () => {
  const body = `<div class="article"><div class="article-hero" style="background-image:url('/cover.jpg')"><h1>Название</h1><div class="date">02.11.2026</div></div><div class="editor cf"><p>Текст <strong>жирный</strong> и <a href="/page/about-us">ссылка</a>.</p><h2>Раздел</h2><ul><li>Пункт<ul><li>Подпункт</li></ul></li></ul><p><img src="//cdn.example.test/body.jpg" alt="Описание"></p><table><tr><th>Имя</th></tr><tr><td>Значение</td></tr></table></div></div><footer>Не содержимое</footer>`
  const value = article(body, base)
  assert.equal(value.title, "Название")
  assert.equal(value.hero_image, "https://texno.store/cover.jpg")
  assert.deepEqual(value.document.blocks.map((block) => block.type), ["paragraph", "heading", "bulletListItem", "image", "table"])
  assert.equal(value.document.blocks[2].children[0].type, "bulletListItem")
  assert.equal(value.images[0].alt, "Описание")
  assert.ok(value.body_html.includes("<table>"))
  assert.ok(!value.body_text.includes("Не содержимое"))
  assert.deepEqual(article(body, base).document, value.document)
})

test("keeps a source snapshot but removes executable markup from import candidates", () => {
  const value = article(`<div class="article"><h1>Источник</h1><div class="editor"><p><a href="javascript:alert(1)">Текст</a><img src="data:image/svg+xml,bad"></p><script>alert(1)</script><iframe src="https://example.test"></iframe></div></div>`, base)
  assert.ok(value.body_html.includes("<script>"))
  assert.ok(!JSON.stringify(value.document).includes("javascript:"))
  assert.ok(!JSON.stringify(value.document).includes("data:image"))
  assert.ok(value.issues.some((issue) => issue.type === "unsupported-embed"))
  assert.ok(value.issues.some((issue) => issue.type === "removed-active-element"))
  assert.throws(() => article("<h1>Missing body</h1>", base), /body selector/)
})
