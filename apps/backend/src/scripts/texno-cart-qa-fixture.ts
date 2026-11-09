import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createProductsWorkflow, createInventoryLevelsWorkflow, deleteProductsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { upsertCatalogAttributesWorkflow } from "../workflows/catalog-attributes"

export default async function fixture({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const handle = "texno-cart-qa-fixture-20261107"
  const fields = ["id", "handle", "metadata", "variants.id", "variants.title", "variants.metadata", "variants.inventory_items.inventory_item_id"]
  let { data } = await query.graph({ entity: "product", fields, filters: { handle } })
  if (process.env.TEXNO_QA_CLEANUP === "1") {
    if (data[0]?.metadata?.texno_cart_qa === true) await deleteProductsWorkflow(container).run({ input: { ids: [data[0].id] } })
    console.log(JSON.stringify({ cleaned: true }))
    return
  }
  if (!data.length) {
    const { data: stores } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
    const { data: profiles } = await query.graph({ entity: "shipping_profile", fields: ["id", "type"] })
    await createProductsWorkflow(container).run({ input: { products: [{ handle, title: "QA — Проверка корзины (тестовый товар)", status: "published", description: "Изолированный тестовый товар. Не для продажи.", sales_channels: [{ id: stores[0].default_sales_channel_id! }], shipping_profile_id: profiles.find((p) => p.type === "default")!.id, metadata: { catalog_scope: "texno", texno_cart_qa: true }, options: [{ title: "Цвет", values: ["Чёрный", "Белый", "Неизвестный остаток"] }], variants: ["Чёрный", "Белый", "Неизвестный остаток"].map((title, i) => ({ title, sku: `TEXNO-CART-QA-${i}`, manage_inventory: true, allow_backorder: false, options: { Цвет: title }, prices: [{ currency_code: "rub", amount: i === 1 ? 1700 : 1500 }], metadata: { texno_cart_qa: true, insales_stock_known: i !== 2 } })) }] } })
    data = (await query.graph({ entity: "product", fields, filters: { handle } })).data
    const { data: locations } = await query.graph({ entity: "stock_location", fields: ["id", "name"] })
    const location = locations.find((l) => l.name === "TEXNO InSales source stock")!
    await createInventoryLevelsWorkflow(container).run({ input: { inventory_levels: data[0].variants.map((v) => ({ inventory_item_id: v.inventory_items![0]!.inventory_item_id, location_id: location.id, stocked_quantity: v.title === "Чёрный" ? 3 : v.title === "Белый" ? 2 : 0 })) } })
  }
  const { data: images } = await query.graph({ entity: "product", fields: ["thumbnail"], filters: { status: "published" }, pagination: { take: 20 } })
  const thumbnail = images.find((p) => p.thumbnail && !p.thumbnail.includes("fixture.png"))?.thumbnail
  await updateProductsWorkflow(container).run({ input: { products: [{ id: data[0].id, thumbnail, metadata: { catalog_scope: "texno", texno_cart_qa: true, insales_product_id: "texno-cart-qa-20261107", insales_kind: "accessory" } }] } })
  await upsertCatalogAttributesWorkflow(container).run({ input: { product_id: data[0].id, source_product_id: "texno-cart-qa-20261107", source_hash: "texno-cart-qa-20261107-v1", source_data: { rows: [{ Описание: "Изолированный тестовый товар. Не для продажи." }] }, searchable_text: "QA проверка корзины", attributes: [], variants: data[0].variants.map((v) => ({ variant_id: v.id, source_variant_id: `qa-${v.id}`, source_data: { Остаток: v.title === "Чёрный" ? "3" : v.title === "Белый" ? "2" : "" }, attributes: [{ key: "variant_color", label: "Цвет варианта", rawValues: [v.title], values: [{ value: v.title, normalized: v.title.toLowerCase(), numericValue: null, unit: null }], dataType: "text" as const, public: true, filterable: true }] })) } })
  console.log(JSON.stringify({ fixture: data[0] }))
}
