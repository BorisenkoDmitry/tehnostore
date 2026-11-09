module.exports = async function catalogSuite(C) {
  const F = C.fixture || await require("../lib/fixture.cjs")(C)
  const { ar, sr, ok, check, db, track, runId } = C
  const definitions = ok(await ar("/catalog-cms/definitions")).definitions
  const axes = F.axes
  const values = axes.map((axis, index) => axis.choice_values.slice(0, index ? 1 : 2))
  const inventory = []
  for (const index of [0, 1]) {
    const item = ok(await ar("/inventory-items", "POST", { sku: "NATIVE-" + runId + "-" + index, title: "Synthetic native inventory " + index })).inventory_item
    track("inventory_item", item.id)
    inventory.push(item)
  }
  const product = ok(await ar("/products", "POST", {
    title: "Native CMS axes " + runId, handle: "native-cms-" + runId,
    status: "published", sales_channels: [{ id: F.channel }], shipping_profile_id: F.shippingProfile,
    options: axes.map((axis, index) => ({ title: axis.aliases?.[0] || axis.label, values: values[index] })),
    variants: values[0].map((value, index) => ({
      title: "Native " + index, sku: "NATIVE-" + runId + "-" + index,
      options: Object.fromEntries(axes.map((axis, n) => [axis.aliases?.[0] || axis.label, n ? values[n][0] : value])),
      manage_inventory: true, allow_backorder: false,
      inventory_items: [{ inventory_item_id: inventory[index].id, required_quantity: 1 }],
      prices: [{ currency_code: "rub", amount: 1950 + index * 100 }],
    })),
  }), "native catalog fixture").product
  track("product", product.id)
  const ids = product.variants.map((variant) => variant.id).sort()
  ids.forEach((id) => track("variant", id))
  const stock = (id, quantities) => require("../lib/fixture-stock.cjs")(C, product, id, F.locations, quantities)
  const snapshot = async () => ({
    variants: (await db.query("SELECT id,sku FROM product_variant WHERE product_id=$1 AND deleted_at IS NULL ORDER BY id", [product.id])).rows,
    inventory: (await db.query("SELECT variant_id,inventory_item_id,required_quantity::text FROM product_variant_inventory_item WHERE variant_id=ANY($1) AND deleted_at IS NULL ORDER BY variant_id,inventory_item_id", [ids])).rows,
    prices: (await db.query("SELECT v.id variant_id,p.currency_code,p.amount::text FROM product_variant v JOIN product_variant_price_set l ON l.variant_id=v.id JOIN price p ON p.price_set_id=l.price_set_id AND p.deleted_at IS NULL WHERE v.id=ANY($1) ORDER BY v.id,p.currency_code,p.amount", [ids])).rows,
  })
  const before = await snapshot()
  const body = { ...F.cms, seo: { title: "Native CMS", description: "Synthetic native axes" }, variants: product.variants.map((variant) => ({ id: variant.id, old_price: null, attributes: [] })) }
  await C.runCase("F8-native-cms-axes", async () => {
    ok(await ar("/catalog-cms/products/" + product.id, "POST", body), "native CMS save")
    const details = ok(await sr("/catalog-products/" + product.id)).product
    check("F8-native-cms-all-profile-axes", axes.every((axis) => details.axes.some((row) => row.code === axis.code)), { axes: details.axes.map((row) => row.code) })
    check("F8-native-values-follow-variant-id", product.variants.every((variant) => {
      const config = details.configurations.find((row) => row.variant_id === variant.id)
      return axes.every((axis) => {
        const native = variant.options.find((option) => product.options.find((row) => row.id === option.option_id)?.title === (axis.aliases?.[0] || axis.label))
        return config?.axes?.[axis.code] === native?.value
      })
    }))
    check("F8-save-keeps-sku-inventory-prices", JSON.stringify(before) === JSON.stringify(await snapshot()), { variant_count: ids.length, inventory_links: before.inventory.length })
    ok(await ar("/catalog-cms/products/" + product.id, "POST", body), "repeat CMS save")
    check("F8-repeat-save-preserves-identities", JSON.stringify(before) === JSON.stringify(await snapshot()))
    const constructor = ok(await ar("/catalog-constructor/products/" + product.id))
    const savedProduct = constructor.product || constructor
    check("F8-constructor-retains-variant-ids", ids.every((id) => savedProduct.variants?.some((row) => row.id === id)))
  })
  const country = F.region.countries[0].iso_2
  const storefrontOrigin = process.env.QA_STOREFRONT_INTERNAL_URL || "http://storefront:8000"
  if (storefrontOrigin !== "http://storefront:8000") throw Error("Unexpected internal storefront target")
  async function page() {
    return fetch(`${storefrontOrigin}/${country}/products/${product.handle}`, { redirect: "manual", signal: AbortSignal.timeout(120000) })
  }
  await C.runCase("F10-hidden-published-product", async () => {
    ok(await ar("/catalog-cms/products/" + product.id, "POST", { ...body, visible: false }))
    check("F10-native-product-still-published", (await sr("/products/" + product.id)).status === 200)
    check("F10-catalog-details-hidden", (await sr("/catalog-products/" + product.id)).status === 404)
    const result = await page()
    check("F10-hidden-card-http-404", result.status === 404, { http: result.status })
    const search = await sr("/search", "POST", { entity: "product", fields: ["id", "title"], filters: { catalog_scope: F.profile.scope, q: product.title }, pagination: { take: 100 } })
    if (search.status === 200) check("F10-hidden-search-excluded", !JSON.stringify(search.data).includes(product.id))
    else C.blocked("F10-search", "Catalog search route contract unavailable: HTTP " + search.status)
    ok(await ar("/catalog-cms/products/" + product.id, "POST", { ...body, visible: true }))
    check("F10-publish-restores-details", (await sr("/catalog-products/" + product.id)).status === 200)
    check("F10-publish-restores-card", (await page()).status === 200)
  })
  await C.runCase("F11-live-product-schema", async () => {
    await stock(product.variants[0].id, [2, 0])
    await stock(product.variants[1].id, [0, 0])
    async function inspect() {
      const details = ok(await sr("/catalog-products/" + product.id)).product
      const response = await page()
      if (response.status !== 200) throw Error("PDP HTTP " + response.status)
      const html = await response.text()
      const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]))
      const schema = scripts.find((item) => item["@type"] === "Product")
      check("F11-offers-match-catalog-" + (details.variants.some((v) => v.inventory_quantity > 0) ? "stocked" : "empty"), !!schema && details.variants.every((variant) => {
        const offer = schema.offers?.find((item) => new URL(item.url).searchParams.get("v_id") === variant.id)
        return offer?.price === variant.price?.toFixed(2) && offer.priceCurrency === "RUB" && offer.availability === (variant.stock_known && variant.inventory_quantity > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock")
      }), { variants: details.variants.map(({ id, price, inventory_quantity }) => ({ id, price, inventory_quantity })) })
    }
    await inspect()
    await stock(product.variants[0].id, [0, 0])
    await inspect()
  })
  C.catalogFixture = { product, variantIds: ids, axes: axes.map((axis) => axis.code), definitions: definitions.length }
}
