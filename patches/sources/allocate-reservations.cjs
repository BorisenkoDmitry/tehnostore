"use strict"

// Shared by the pinned Medusa patch and its regression tests. All arithmetic is
// performed with Medusa MathBN; a kit's required_quantity is inventory units.
function allocateReservations(items, levels, MathBN, invalid) {
  const available = new Map(levels.map((level) => [
    `${level.inventory_item_id}:${level.location_id}`,
    MathBN.sub(level.raw_stocked_quantity ?? level.stocked_quantity, level.raw_reserved_quantity ?? level.reserved_quantity),
  ]))
  const reservations = []
  const add = (item, location_id, quantity) => {
    const previous = reservations.find((row) => row.line_item_id === item.id && row.inventory_item_id === item.inventory_item_id && row.location_id === location_id)
    if (previous) previous.quantity = MathBN.add(previous.quantity, quantity)
    else reservations.push({ line_item_id: item.id, inventory_item_id: item.inventory_item_id, quantity, allow_backorder: !!item.allow_backorder, location_id })
  }
  // Bipartite residual flow avoids a greedy false stockout: [A,B] and [A]
  // with A=1/B=1 must allocate B/A, even if the broader line arrives first.
  const ordinary = items.filter((item) => !item.allow_backorder)
  const graph = new Map()
  const edge = (from, to, capacity) => {
    const forward = { to, capacity, initial: capacity }, reverse = { to: from, capacity: 0 }
    forward.reverse = reverse
    reverse.reverse = forward
    if (!graph.has(from)) graph.set(from, [])
    if (!graph.has(to)) graph.set(to, [])
    graph.get(from).push(forward)
    graph.get(to).push(reverse)
    return forward
  }
  const edges = []
  for (const [index, item] of ordinary.entries()) {
    const quantity = MathBN.mult(item.quantity, item.required_quantity)
    if (!MathBN.gt(quantity, 0)) throw invalid("Reservation quantity must be positive")
    const source = edge("source", `item:${index}`, quantity)
    const allocations = []
    for (const location_id of [...new Set(item.location_ids ?? [])].sort()) {
      const key = `${item.inventory_item_id}:${location_id}`
      if (!available.has(key)) continue
      allocations.push({ location_id, edge: edge(`item:${index}`, `location:${key}`, quantity) })
    }
    edges.push({ item, source, allocations })
  }
  for (const [key, capacity] of available) edge(`location:${key}`, "sink", MathBN.gt(capacity, 0) ? capacity : 0)
  for (;;) {
    const queue = ["source"], parents = new Map([["source", null]])
    for (let index = 0; index < queue.length && !parents.has("sink"); index++) {
      const from = queue[index]
      for (const candidate of graph.get(from) ?? []) {
        if (!MathBN.gt(candidate.capacity, 0) || parents.has(candidate.to)) continue
        parents.set(candidate.to, { from, edge: candidate })
        queue.push(candidate.to)
      }
    }
    if (!parents.has("sink")) break
    let quantity
    for (let node = "sink"; node !== "source";) {
      const parent = parents.get(node)
      if (quantity === undefined || MathBN.gt(quantity, parent.edge.capacity)) quantity = parent.edge.capacity
      node = parent.from
    }
    for (let node = "sink"; node !== "source";) {
      const parent = parents.get(node)
      parent.edge.capacity = MathBN.sub(parent.edge.capacity, quantity)
      parent.edge.reverse.capacity = MathBN.add(parent.edge.reverse.capacity, quantity)
      node = parent.from
    }
  }
  for (const { item, source, allocations } of edges) {
    if (MathBN.gt(source.capacity, 0)) throw invalid("Some variant does not have the required inventory")
    for (const allocation of allocations) {
      const quantity = MathBN.sub(allocation.edge.initial, allocation.edge.capacity)
      if (!MathBN.gt(quantity, 0)) continue
      add(item, allocation.location_id, quantity)
      const key = `${item.inventory_item_id}:${allocation.location_id}`
      available.set(key, MathBN.sub(available.get(key), quantity))
    }
  }
  // Explicit backorders consume remaining physical capacity after ordinary lines.
  for (const item of items.filter((row) => row.allow_backorder)) {
    let remaining = MathBN.mult(item.quantity, item.required_quantity)
    if (!MathBN.gt(remaining, 0)) throw invalid("Reservation quantity must be positive")
    const locations = [...new Set(item.location_ids ?? [])]
      .filter((id) => available.has(`${item.inventory_item_id}:${id}`))
      .sort()
    for (const location_id of locations) {
      const key = `${item.inventory_item_id}:${location_id}`
      const capacity = available.get(key)
      if (!MathBN.gt(capacity, 0)) continue
      const quantity = MathBN.gt(remaining, capacity) ? capacity : remaining
      add(item, location_id, quantity)
      available.set(key, MathBN.sub(capacity, quantity))
      remaining = MathBN.sub(remaining, quantity)
      if (!MathBN.gt(remaining, 0)) break
    }
    if (MathBN.gt(remaining, 0)) {
      if (!item.allow_backorder || !locations.length) throw invalid("Some variant does not have the required inventory")
      const location_id = locations[0]
      const key = `${item.inventory_item_id}:${location_id}`
      add(item, location_id, remaining)
      available.set(key, MathBN.sub(available.get(key), remaining))
    }
  }
  return reservations
}

module.exports = { allocateReservations }
