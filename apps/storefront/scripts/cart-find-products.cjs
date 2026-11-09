const fs = require("node:fs")
const path = require("node:path")
const root = path.resolve(__dirname, "../../..")
try { process.loadEnvFile(path.join(root, ".env")) } catch {}
const headers = { "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY }
const request = async route => {
  const response = await fetch("http://localhost:9000" + route, { headers })
  if (!response.ok) throw new Error(`Store lookup status ${response.status}`)
  return response.json()
}
async function main() {
  const found = []
  for (const [kind, query] of [["phone", "iPhone 11 Pro"], ["accessory", "AirPods"]]) {
    const params = new URLSearchParams({ q: query, limit: "20", fields: "id,title,handle,metadata,thumbnail" })
    const { products } = await request("/store/products?" + params)
    for (const product of products) {
      if (!product.metadata?.insales_product_id || product.metadata?.texno_cart_qa || product.metadata?.insales_kind !== kind) continue
      const { product: details } = await request(`/store/catalog-products/${product.id}`)
      const variant = details.variants.find(variant => variant.stock_known && variant.inventory_quantity > 0 && variant.price > 0)
      if (!variant) continue
      found.push({ kind, title: product.title, handle: product.handle, product_id: product.id, variant_id: variant.id, variant_title: variant.title, price: variant.price, inventory_quantity: variant.inventory_quantity, url: `http://localhost:8000/dk/products/${product.handle}?v_id=${variant.id}` })
      break
    }
  }
  fs.writeFileSync(path.join(root, "output/cart-qa-real-products.json"), JSON.stringify(found, null, 2))
  console.log(JSON.stringify(found))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
