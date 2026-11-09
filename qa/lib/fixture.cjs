module.exports = async function fixture(C) {
  const { ok, ar, sr, track, db } = C
  const runId = C.runId + "-" + (C.fixtureSequence = (C.fixtureSequence || 0) + 1)
  const profile = ok(await ar("/catalog-cms/profile")).profile
  const config = ok(await ar("/checkout-settings")).configuration
  const region = ok(await ar("/regions/" + profile.region_id)).region
  if (region.currency_code !== "rub") throw Error("Fixture expects RUB test store")
  const locations = ok(await ar("/stock-locations?fields=id,name,*sales_channels,*fulfillment_sets,*fulfillment_sets.service_zones")).stock_locations
  if (locations.length !== 2) throw Error("Exactly two test locations required")
  const channel = ok(await ar("/stores")).stores[0].default_sales_channel_id
  const shippingProfile = ok(await ar("/shipping-profiles")).shipping_profiles.find(item => item.type === "default").id
  const type = profile.product_types.find(item => item.enabled)
  const definitions = ok(await ar("/catalog-cms/definitions")).definitions
  const axes = type.variant_axes.map(code => definitions.find(item => item.code === code))
  if (!axes.length || axes.some(item => !item)) throw Error("Fixture requires configured axes")
  const choices = axes.map((axis,index) => {
    const available = axis.choice_values || []
    if (index === 0 && available.length < 3) throw Error("Fixture requires three approved values on first axis")
    return available.slice(0, index === 0 ? 3 : 1)
  })
  const inventory = ok(await ar("/inventory-items", "POST", { sku: "REMED-" + runId + "-shared", title: "Synthetic shared inventory" })).inventory_item
  track("inventory_item", inventory.id)
  const product = ok(await ar("/products", "POST", {
    title: "Remediation synthetic " + runId, handle: "remediation-" + runId, status: "published", sales_channels: [{ id: channel }], shipping_profile_id: shippingProfile,
    options: axes.map((axis,index) => ({ title: axis.label, values: choices[index] })),
    variants: choices[0].map((value,index) => ({ title: String(index), sku: "REMED-" + runId + "-" + index, options: Object.fromEntries(axes.map((axis,n) => [axis.label,n ? choices[n][0] : value])), manage_inventory: true, allow_backorder: false, prices: [{ currency_code: "rub", amount: 1000 }], ...(index < 2 ? { inventory_items: [{ inventory_item_id: inventory.id, required_quantity: 1 }] } : {}) })),
  }), "create product").product
  track("product", product.id)
  const variants = product.variants.sort((a,b) => a.sku.localeCompare(b.sku))
  variants.forEach(item => track("variant", item.id))
  const category = ok(await ar("/product-categories?limit=100")).product_categories.find(item => item.metadata?.catalog_scope === profile.scope && item.metadata?.catalog_kind === type.code)
  if (!category) throw Error("No published category for configured product type")
  const cms = { visible: true, kind: type.code, brand: "Synthetic", category_ids: [category.id], family_id: null, seo: { title: "Synthetic", description: "Synthetic fixture" }, attributes: [], variants: variants.map((variant,index) => ({ id: variant.id, old_price: null, attributes: axes.map((axis,n) => ({ code: axis.code, values: [n ? choices[n][0] : choices[0][index]] })) })) }
  ok(await ar("/catalog-cms/products/" + product.id, "POST", cms), "publish CMS fixture")
  const delivery = config.delivery_methods.find(item => item.enabled !== false && item.required_fields.includes("street"))
  const pickup = config.delivery_methods.find(item => item.enabled !== false && item.required_fields.includes("pickup"))
  if (!delivery || !pickup) throw Error("Fixture requires delivery and pickup")
  async function stock(variantId, quantities) {
    // Confirmation is explicitly per SKU in the application. Confirm every own
    // fixture SKU sharing this item so rejection tests exercise aggregate demand,
    // rather than accidentally passing because a sibling's provenance is unknown.
    const siblings = (await db.query("SELECT DISTINCT sibling.variant_id FROM product_variant_inventory_item sibling WHERE sibling.deleted_at IS NULL AND sibling.variant_id=ANY($1) AND sibling.inventory_item_id IN (SELECT inventory_item_id FROM product_variant_inventory_item WHERE variant_id=$2 AND deleted_at IS NULL) ORDER BY sibling.variant_id", [variants.map((variant) => variant.id), variantId])).rows.map((row) => row.variant_id)
    if (!siblings.includes(variantId)) throw Error("Fixture inventory link is missing")
    for (const id of siblings) for (const [index, location] of locations.entries()) {
      const confirmation = ok(await ar("/catalog-cms/stock/" + id, "POST", { location_id: location.id, quantity: quantities[index], reason: "Synthetic remediation fixture " + runId }), "set own stock")
      if (confirmation.confirmation_id) track("catalog_change", confirmation.confirmation_id)
    }
  }
  const levels = async ids => (await db.query("SELECT inventory_item_id,location_id,stocked_quantity::text stocked,reserved_quantity::text reserved,(stocked_quantity-reserved_quantity)::text available,(SELECT coalesce(sum(quantity),0)::text FROM reservation_item r WHERE r.inventory_item_id=l.inventory_item_id AND r.location_id=l.location_id AND r.deleted_at IS NULL) actual_reserved FROM inventory_level l WHERE l.deleted_at IS NULL AND l.inventory_item_id IN (SELECT inventory_item_id FROM product_variant_inventory_item WHERE variant_id=ANY($1) AND deleted_at IS NULL) ORDER BY inventory_item_id,location_id", [ids])).rows
  async function cart(variantId, quantity = 1, customerHeaders) {
    const result = ok(await sr("/texno-cart", "POST", {}))
    track("cart", result.cart.id)
    const cart = { id: result.cart.id, h: { "x-texno-cart-token": result.token, ...customerHeaders } }
    if (variantId) ok(await item(cart, variantId, quantity), "add cart variant")
    return cart
  }
  const item = (cart, variantId, quantity) => sr("/texno-cart/" + cart.id + "/items", "POST", { variant_id: variantId, quantity, mutation_id: C.randomUUID() }, cart.h)
  const quote = (cart, method = delivery.id) => sr("/texno-cart/" + cart.id + "/quote", "POST", { delivery_method: method, services: [] }, cart.h)
  const checkoutBody = (total, method = delivery.id) => ({ name: "Synthetic buyer", phone: "+79990000001", email: "qa-" + runId + "@example.test", city: "Москва", delivery_method: method, address: { street: "Синтетическая", house: "1", pickup: "Synthetic pickup" }, delivery_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0,10), delivery_slot: config.delivery_slots[0], payment_preference: "cash", services: [], consent: true, expected_total: total })
  const checkout = async (cart, method = delivery.id, extra = {}) => {
    const q = ok(await quote(cart, method), "quote")
    const response = await sr("/texno-cart/" + cart.id + "/checkout", "POST", { ...checkoutBody(q.quote.total, method), ...extra }, cart.h)
    if (response.data.order?.id) track("order", response.data.order.id)
    return response
  }
  C.fixture = { product, variants, inventory, cms, profile, config, region, channel, shippingProfile, locations, delivery, pickup, axes, stock, levels, cart, item, quote, checkoutBody, checkout }
  return C.fixture
}
