module.exports = async function ownFixtureStock(C, product, variantId, locations, quantities) {
  if (!C.report.fixtures.some((entry) => entry.type === "product" && entry.id === product.id) || !product.variants.some((variant) => variant.id === variantId)) throw Error("Stock confirmation requires this run's tracked product and variant")
  const links = (await C.db.query("SELECT l.inventory_item_id FROM product_variant_inventory_item l JOIN product_variant v ON v.id=l.variant_id AND v.deleted_at IS NULL WHERE l.variant_id=$1 AND v.product_id=$2 AND l.deleted_at IS NULL", [variantId, product.id])).rows
  if (links.length !== 1 || !C.report.fixtures.some((entry) => entry.type === "inventory_item" && entry.id === links[0].inventory_item_id)) throw Error("Own fixture inventory link is missing or untracked")
  for (const [index, location] of locations.entries()) {
    const result = C.ok(await C.ar("/catalog-cms/stock/" + variantId, "POST", { location_id: location.id, quantity: quantities[index], reason: "Synthetic own fixture " + C.runId }), "confirm own fixture stock")
    if (result.confirmation_id) C.track("catalog_change", result.confirmation_id)
  }
}
