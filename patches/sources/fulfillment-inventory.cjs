"use strict"

// A line can reserve one inventory item at several locations. Consume the
// requested inventory units once per component, leaving each remainder at its
// original location. An explicit fulfillment location changes the physical
// source only; it does not move the unfulfilled reservation.
function planFulfillmentInventory({ reservations, order, input, inputItemsMap, itemsList }, MathBN, invalid) {
  const toDelete = [], toUpdate = [], inventoryAdjustment = []
  const allItems = itemsList ?? order.items
  for (const item of allItems.filter((row) => row.id in inputItemsMap)) {
    const requested = inputItemsMap[item.id].quantity
    if (!MathBN.gt(requested, 0)) throw invalid("Fulfillment quantity must be positive")
    const rows = reservations.filter((row) => row.line_item_id === item.id)
    if (!rows.length) {
      if (item.variant?.manage_inventory) throw invalid(`No stock reservation found for item ${item.id}`)
      continue
    }
    const components = new Map()
    for (const row of rows) {
      const component = components.get(row.inventory_item_id) ?? []
      component.push(row)
      components.set(row.inventory_item_id, component)
    }
    for (const [inventoryId, componentRows] of components) {
      const component = item.variant?.inventory_items?.find((row) => (row.inventory?.id ?? row.inventory_item_id) === inventoryId)
      let remaining = MathBN.mult(requested, component?.required_quantity ?? 1)
      // Prefer reservations already held at the chosen physical source.
      componentRows.sort((a, b) => Number(b.location_id === input.location_id) - Number(a.location_id === input.location_id) || a.id.localeCompare(b.id))
      for (const row of componentRows) {
        if (!MathBN.gt(remaining, 0)) break
        const consumed = MathBN.gt(remaining, row.quantity) ? row.quantity : remaining
        const rest = MathBN.sub(row.quantity, consumed)
        inventoryAdjustment.push({ inventory_item_id: inventoryId, location_id: input.location_id ?? row.location_id, adjustment: MathBN.mult(consumed, -1) })
        if (MathBN.eq(rest, 0)) toDelete.push(row.id)
        else toUpdate.push({ id: row.id, quantity: rest })
        remaining = MathBN.sub(remaining, consumed)
      }
      if (MathBN.gt(remaining, 0)) throw invalid(`Quantity to fulfill exceeds reserved quantity for item ${item.id}`)
    }
  }
  return { toDelete, toUpdate, inventoryAdjustment }
}

module.exports = { planFulfillmentInventory }
