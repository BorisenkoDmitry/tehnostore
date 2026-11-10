const path = require("node:path")
const { createRequire } = require("node:module")
const assert = require("node:assert/strict")
const local = createRequire("/server/apps/backend/package.json")
const { Client } = local("@medusajs/framework/pg")
const { updateProductsWorkflow, updateProductVariantsWorkflow, updateProductCategoriesWorkflow } = local("@medusajs/medusa/core-flows")

exports.default = async function verifyCatalogPerformance({ container }) {
  assert.equal(process.env.CATALOG_PERFORMANCE_TEST, "1", "Only the disposable benchmark stack may run this test")
  const connection = new Client({ connectionString: process.env.DATABASE_URL })
  await connection.connect()
  try {
    assert.equal((await connection.query("SELECT current_setting('catalog_performance.guard', true) AS guard")).rows[0].guard, "catalog-performance-20261110")
  } finally { await connection.end() }
  // `medusa exec` skips the server's application-start lifecycle.
  await container.resolve("caching").__hooks.onApplicationStart()
  const root = process.cwd()
  const { invalidateCatalogAfterWrite } = local(path.join(root, "src/api/catalog-cache-middleware.js"))
  const write = (operation) => new Promise((resolve, reject) => {
    const res = { statusCode: 200, json: resolve }
    invalidateCatalogAfterWrite({ scope: container }, res, (error) => {
      if (error) return reject(error)
      Promise.resolve().then(operation).then((result) => res.json(result), reject)
    })
  })
  const { getCatalogDefinitions, getCatalogCategories } = local(path.join(root, "src/lib/catalog-read-cache.js"))
  const { variantSearchProjection } = local(path.join(root, "src/lib/catalog-variant-search.js"))
  const { matchesCatalogVariant } = local(path.join(root, "src/search/helpers/match-catalog-variants.js"))
  const { GET } = local(path.join(root, "src/api/store/catalog-products/[id]/route.js"))
  const service = container.resolve("catalogAttributes")
  const query = container.resolve("query")
  const passed = []
  const fixtures = []
  let definition
  try {
    await getCatalogDefinitions(container)
    definition = await write(() => service.createCatalogDefinitions({ code: `perf_${Date.now()}`, label: "Performance fixture", type: "text" }))
    assert((await getCatalogDefinitions(container)).some(({ id }) => id === definition.id), "CMS create must invalidate an already warm reference list")
    await write(() => service.updateCatalogDefinitions({ id: definition.id, label: "Updated performance fixture" }))
    assert.equal((await getCatalogDefinitions(container)).find(({ id }) => id === definition.id).label, "Updated performance fixture")
    await write(() => service.softDeleteCatalogDefinitions(definition.id))
    assert(!(await getCatalogDefinitions(container)).some(({ id }) => id === definition.id))
    await write(() => service.restoreCatalogDefinitions(definition.id))
    assert((await getCatalogDefinitions(container)).some(({ id }) => id === definition.id))
    passed.push("CMS definition create/update/delete/restore invalidates warm Redis reads")

    const values = [["Красный", "S", "64"], ["Красный", "M", "128"], ["Синий", "S", "128"]]
    const variants = values.map(([color, size, storage], index) => ({ id: String(index), options: [{ option: { title: "Цвет" }, value: color }, { option: { title: "Размер" }, value: size }, { option: { title: "Память" }, value: storage }] }))
    const projection = variantSearchProjection(variants)
    const id = `prod_performance_${Date.now()}`
    fixtures.push(id)
    await service.replaceVariantSearches([{ id, ...projection }])
    let comparisons = 0
    for (const color of ["красный", "синий", "нет"]) for (const size of ["s", "m", "xl"]) for (const memory of ["64", "128"]) {
      const groups = [[`цвет:${color}`], [`размер:${size}`], [`память:${memory}`]]
      assert.equal((await service.findVariantMismatches(groups)).includes(id), !matchesCatalogVariant(variants, groups))
      comparisons++
    }
    for (const groups of [[["цвет:красный", "цвет:синий"], ["размер:s"], ["память:128"]], [["цвет:красный"], ["материал:хлопок"]]]) assert.equal((await service.findVariantMismatches(groups)).includes(id), !matchesCatalogVariant(variants, groups))
    await service.replaceVariantSearches([{ id, ...variantSearchProjection([variants[0]]) }])
    assert(!(await service.findVariantMismatches([["цвет:красный"], ["размер:s"]])).includes(id))
    passed.push(`SQL variant correlation agrees with previous behavior in ${comparisons + 3} cases including three axes and OR`)

    const { data: products } = await query.graph({ entity: "product", fields: ["id", "status", "metadata", "sales_channels.id", "categories.id", "variants.id", "variants.metadata", "variants.price_set.prices.*"], filters: { status: "published" }, pagination: { take: 1 } })
    const product = products[0]
    const channels = product.sales_channels.map(({ id }) => id)
    const read = async (salesChannelIds = channels) => {
      let result
      await GET({ params: { id: product.id }, scope: container, publishable_key_context: { sales_channel_ids: salesChannelIds } }, { setHeader() {}, json(data) { result = data.product } })
      return result
    }
    await read()
    await assert.rejects(() => read([]))
    await assert.rejects(() => read(["sc_unrelated_performance_fixture"]))
    passed.push("Warm product reads still reject absent and unrelated sales channels")
    try {
      await write(() => updateProductsWorkflow(container).run({ input: { products: [{ id: product.id, metadata: { ...product.metadata, catalog_seo: { title: "Changed through CMS" } } }] } }))
      assert.equal((await read()).seo.title, "Changed through CMS")
      await write(() => updateProductsWorkflow(container).run({ input: { products: [{ id: product.id, status: "draft" }] } }))
      await assert.rejects(() => read())
      await write(() => updateProductsWorkflow(container).run({ input: { products: [{ id: product.id, status: "published" }] } }))
      assert((await read()).id === product.id)
      passed.push("CMS product edits, hiding and restoring invalidate the warm product snapshot")
    } finally { await write(() => updateProductsWorkflow(container).run({ input: { products: [{ id: product.id, metadata: product.metadata, status: product.status }] } })) }

    const before = await read()
    const variant = product.variants.find((variant) => variant.price_set?.prices?.some((price) => price.currency_code === before.currency_code && !price.price_list_id))
    assert(variant, "A priced variant is needed for freshness regression")
    const prices = variant.price_set.prices.filter((price) => !price.price_list_id).map(({ id, currency_code, amount, min_quantity, max_quantity }) => ({ id, currency_code, amount: Number(amount), min_quantity, max_quantity }))
    const nextPrices = prices.map((price) => price.currency_code === before.currency_code ? { ...price, amount: price.amount + 1 } : price)
    try {
      await updateProductVariantsWorkflow(container).run({ input: { product_variants: [{ id: variant.id, prices: nextPrices }] } })
      const after = await read()
      const previousQuote = before.variants.find(({ id }) => id === variant.id)
      const nextQuote = after.variants.find(({ id }) => id === variant.id)
      // A fixed promotional quote can stay constant when its original price
      // changes. The comparison price must still reflect the new native base.
      assert(nextQuote.price === previousQuote.price + 1 || nextQuote.old_price === previousQuote.old_price + 1)
      passed.push("Price changes appear on the next product request with warm static data")
    } finally { await updateProductVariantsWorkflow(container).run({ input: { product_variants: [{ id: variant.id, prices }] } }) }

    const { data: stockProducts } = await query.graph({ entity: "product", fields: ["id", "variants.id", "variants.inventory_items.inventory.location_levels.*"], filters: { id: product.id } })
    const level = stockProducts[0].variants.find(({ id }) => id === variant.id)?.inventory_items?.[0]?.inventory?.location_levels?.[0]
    assert(level, "An inventory-backed fixture is required")
    const inventory = container.resolve("inventory")
    const initialQuantity = (await read()).variants.find(({ id }) => id === variant.id).inventory_quantity
    assert.notEqual(initialQuantity, null, "The fixture must have known stock provenance")
    try {
      await inventory.updateInventoryLevels({ inventory_item_id: level.inventory_item_id, location_id: level.location_id, stocked_quantity: Number(level.stocked_quantity) + 1 })
      assert.equal((await read()).variants.find(({ id }) => id === variant.id).inventory_quantity, initialQuantity + 1)
      passed.push("Inventory changes appear on the next request without a CMS cache flush")
    } finally { await inventory.updateInventoryLevels({ inventory_item_id: level.inventory_item_id, location_id: level.location_id, stocked_quantity: Number(level.stocked_quantity) }) }

    const categoryId = product.categories[0]?.id
    if (categoryId) {
      const categories = await getCatalogCategories(container)
      const category = categories.find(({ id }) => id === categoryId)
      try {
        await write(() => updateProductCategoriesWorkflow(container).run({ input: { selector: { id: categoryId }, update: { is_active: !category.is_active } } }))
        assert.equal((await getCatalogCategories(container)).find(({ id }) => id === categoryId).is_active, !category.is_active)
        passed.push("Native category changes invalidate cached category policy")
      } finally { await write(() => updateProductCategoriesWorkflow(container).run({ input: { selector: { id: categoryId }, update: { is_active: category.is_active } } })) }
    }
    console.log(JSON.stringify({ status: "PASS", passed }, null, 2))
  } finally {
    if (fixtures.length) await service.deleteCatalogVariantSearches(fixtures)
    if (definition) await write(() => service.deleteCatalogDefinitions(definition.id))
  }
}
