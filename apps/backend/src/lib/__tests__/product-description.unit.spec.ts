import { categorySeoWithDescription, descriptionTree, productDescription, publicCategorySeo, sourceDescription, type DescriptionNode } from "../product-description"
import { descriptionText } from "../insales"

const text = (nodes: DescriptionNode[]): string => nodes.map((node) => "text" in node ? node.text : text(node.children)).join("")
const tags = (nodes: DescriptionNode[]): string[] => nodes.flatMap((node) => "text" in node ? [] : [node.tag, ...tags(node.children)])

describe("safe complete product descriptions", () => {
  it("keeps paragraphs, headings, lists, emphasis, order and decoded entities", () => {
    const tree = descriptionTree("<h1>Title &amp; detail</h1><p>A&nbsp;<strong>bold</strong> &lt;test&gt;</p><h2>Features</h2><ul><li>First</li><li><em>Second</em></li></ul>")
    expect(tags(tree)).toEqual(["h3", "p", "strong", "h3", "ul", "li", "li", "em"])
    expect(text(tree)).toBe("Title & detailA\u00a0bold <test>FeaturesFirstSecond")
  })
  it("repairs malformed HTML without losing long text or the final paragraph", () => {
    const long = "Long complete description. ".repeat(4000)
    const tree = descriptionTree(`<p>Start<ul><li>First<li>Second</ul><p>${long}<p>Final`)
    expect(text(tree)).toBe("StartFirstSecond" + long + "Final")
    expect(tags(tree).filter((tag) => tag === "li")).toHaveLength(2)
  })
  it("drops executable elements, namespaces, styles, arbitrary attrs and unsafe links", () => {
    const tree = descriptionTree('<p onclick="bad()" style="color:red">Safe<img src=x onerror="bad()"></p><script>bad()</script><iframe src=x>bad</iframe><style>bad</style><svg><script>bad</script></svg><a href="jav&#x61;script:bad()">keep link text</a><a href="data:text/html,bad">data text</a><a href="//evil.test">protocol relative</a>')
    expect(text(tree)).toBe("Safekeep link textdata textprotocol relative")
    expect(tags(tree)).toEqual(["p"])
    expect(JSON.stringify(tree)).not.toMatch(/onclick|onerror|style|javascript|iframe|<script|data:text/)
  })
  it("accepts safe URL schemes and strips credentials and obfuscated schemes", () => {
    const tree = descriptionTree('<a href="https://example.com/help?a=1&amp;b=2">Help</a><a href="java&#10;script:x">x</a><a href="https://user:pass@example.com">y</a>')
    expect(tree[0]).toMatchObject({ tag: "a", href: "https://example.com/help?a=1&b=2" })
    expect(tags(tree)).toEqual(["a"])
  })
  it("deduplicates repeated variant copies and appends additional source description in order", () => {
    const tree = sourceDescription({ original_description_html: ["<p>Main</p>", "<p>Main</p>"], rows: [{ "Дополнительное описание": "<h2>Extra</h2><p>End</p>", "Себестоимость": "PRIVATE" }] })!
    expect(text(tree)).toBe("MainExtraEnd")
    expect(JSON.stringify(tree)).not.toContain("PRIVATE")
    expect(sourceDescription({})).toBeUndefined()
  })
  it("preserves rich imported layout when the native description matches the exact import baseline", () => {
    const main = "<h2>Features</h2><p>One &amp; two</p><ul><li>Final</li></ul>"
    const extra = "<p>Additional detail</p>"
    const source = { original_description_html: [main], rows: [{ "Описание": main, "Дополнительное описание": extra }] }
    const baseline = [descriptionText(main), descriptionText(extra)].join("\n\n")
    expect(productDescription(source, baseline)).toEqual(sourceDescription(source))
    expect(tags(productDescription(source, baseline))).toContain("ul")
  })
  it("uses merchant edits and leaves the private import snapshot unchanged", () => {
    const source = { original_description_html: ["<p>Old source text</p>"], rows: [{ "Описание": "<p>Old source text</p>", "Себестоимость": "PRIVATE" }] }
    const before = JSON.stringify(source)
    const tree = productDescription(source, "Updated by merchant\n\nNew details")
    expect(text(tree)).toBe("Updated by merchantNew details")
    expect(tags(tree)).toEqual(["p", "p"])
    expect(JSON.stringify(source)).toBe(before)
    expect(JSON.stringify(tree)).not.toMatch(/Old source|PRIVATE/)
  })
  it("honors an intentionally cleared description and treats HTML-looking CMS input as text", () => {
    const source = { rows: [{ "Описание": "<strong>Old</strong>" }] }
    expect(productDescription(source, "")).toEqual([])
    expect(productDescription(source, null)).toEqual([])
    const input = '<script>alert(1)</script><img src=x onerror="bad()">'
    expect(productDescription(source, input)).toEqual([{ tag: "p", children: [{ text: input }] }])
  })
})

describe("category text formatting", () => {
  const seo = { title: "Title", description: "Meta description", text: "Details" }

  it("stores sanitized markup and exposes its structured content separately from meta tags", () => {
    const saved = categorySeoWithDescription({ ...seo, text_html: '<h2>Details</h2><script>bad()</script><p><strong>Note</strong><a href="javascript:bad()">link</a></p>' }, undefined)
    expect(saved.text_html).toBe("<h2>Details</h2><p><strong>Note</strong>link</p>")
    const publicSeo = publicCategorySeo(saved)!
    expect(publicSeo).toMatchObject(seo)
    expect(tags(publicSeo.content!)).toEqual(["h3", "p", "strong"])
    expect(publicSeo).not.toHaveProperty("text_html")
  })

  it("keeps rich text when a legacy client updates only its meta fields", () => {
    const before = { ...seo, text_html: "<p><strong>Details</strong></p>" }
    expect(categorySeoWithDescription({ ...seo, title: "New title" }, before).text_html).toBe(before.text_html)
    expect(categorySeoWithDescription({ ...seo, text: "New text" }, before).text_html).toBeUndefined()
    expect(categorySeoWithDescription({ ...seo, text: "", text_html: "" }, before).text_html).toBe("")
  })
})
