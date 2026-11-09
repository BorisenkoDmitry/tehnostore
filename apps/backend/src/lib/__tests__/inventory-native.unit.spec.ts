import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { runInNewContext } from "node:vm"
import InventoryModule from "@medusajs/medusa/inventory"
import { MathBN } from "@medusajs/framework/utils"

// Deliberately load the installed, version-pinned runtime code. Missing patches
// are failures rather than skipped tests or expected failures.
const medusaRequire = createRequire(require.resolve("@medusajs/medusa/core-flows"))
const coreDir = dirname(medusaRequire.resolve("@medusajs/core-flows"))
const { allocateReservations } = require(join(coreDir, "cart/utils/allocate-reservations.js"))
const { planFulfillmentInventory } = require(join(coreDir, "order/utils/fulfillment-inventory.js"))
const prototype = InventoryModule.service.prototype as any
const invalid = (message: string) => new Error(message)
const level = (location_id: string, stocked_quantity: number, reserved_quantity = 0) => ({ id: `level_${location_id}`, inventory_item_id: "shared", location_id, stocked_quantity, reserved_quantity, available_quantity: stocked_quantity - reserved_quantity })
const item = (id: string, quantity = 1, required_quantity = 1, allow_backorder = false) => ({ id, inventory_item_id: "shared", quantity, required_quantity, allow_backorder, location_ids: ["a", "b"] })

describe("installed inventory allocation (F1, F2)", () => {
  it("rejects two variants sharing one physical unit", () => {
    expect(() => allocateReservations([item("one"), item("two")], [level("a", 1)], MathBN, invalid)).toThrow("required inventory")
  })
  it("splits a line over 1+1 and reserves exactly two inventory units", () => {
    const rows = allocateReservations([item("line", 2)], [level("a", 1), level("b", 1)], MathBN, invalid)
    expect(rows.map((row) => [row.location_id, Number(row.quantity)])).toEqual([["a", 1], ["b", 1]])
  })
  it("sums kit components and shared variants", () => {
    expect(() => allocateReservations([item("kit", 1, 2), item("single")], [level("a", 2)], MathBN, invalid)).toThrow("required inventory")
    expect(allocateReservations([item("kit", 1, 2)], [level("a", 1), level("b", 1)], MathBN, invalid)).toHaveLength(2)
  })
  it("finds a valid allocation when allowed location sets overlap", () => {
    const rows = allocateReservations([item("broad"), { ...item("restricted"), location_ids: ["a"] }], [level("a", 1), level("b", 1)], MathBN, invalid)
    expect(rows.map((row) => [row.line_item_id, row.location_id])).toEqual([["broad", "b"], ["restricted", "a"]])
  })
  it("honors allowed locations, current reservations and explicit backorders", () => {
    expect(() => allocateReservations([{ ...item("pickup", 2), location_ids: ["a"] }], [level("a", 1), level("b", 10)], MathBN, invalid)).toThrow()
    expect(() => allocateReservations([item("line")], [level("a", 1, 1)], MathBN, invalid)).toThrow()
    const rows = allocateReservations([item("back", 2, 1, true), item("ordinary")], [level("a", 1)], MathBN, invalid)
    expect(rows.find((row) => row.line_item_id === "ordinary").allow_backorder).toBe(false)
    expect(rows.reduce((sum, row) => sum + Number(row.quantity), 0)).toBe(3)
  })
  it.each([0, -1])("rejects nonpositive reservation demand %s", (quantity) => {
    expect(() => allocateReservations([item("line", quantity)], [level("a", 3)], MathBN, invalid)).toThrow("positive")
  })
})

describe("installed inventory module (F1, F4, F15)", () => {
  it("locks rows with refresh and validates aggregate demand before writing", async () => {
    const rows = [level("a", 1)]
    const find = jest.fn(async () => rows)
    const fake = { inventoryLevelService_: { list: async () => rows } }
    const data = [item("one"), item("two")].map(({ inventory_item_id, quantity }) => ({ inventory_item_id, quantity, location_id: "a" }))
    await expect(prototype.ensureInventoryLevels.call(fake, data, { validateQuantityAtLocation: true }, { transactionManager: { find } })).rejects.toThrow("Not enough stock")
    expect(find).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ lockMode: 3, refresh: true }))
  })
  it("rejects negative reservation creation before any mutation", async () => {
    const ensure = jest.fn()
    await expect(prototype.createReservationItems_.call({ ensureInventoryLevels: ensure }, [{ ...item("line", -1), location_id: "a" }], { transactionManager: {} })).rejects.toThrow("positive")
    expect(ensure).not.toHaveBeenCalled()
  })
  it("rejects negative reservation update before any read or mutation", async () => {
    const find = jest.fn()
    await expect(prototype.updateReservationItems_.call({}, [{ id: "reservation", quantity: -1 }], { transactionManager: { find } })).rejects.toThrow("negative")
    expect(find).not.toHaveBeenCalled()
  })
  it("updates both counters when reducing and moving a reservation", async () => {
    const rows = [level("a", 4, 2), level("b", 4)]
    const ensure = jest.fn(async (...args: any[]) => rows)
    const update = jest.fn(async (data) => data)
    const fake = { ensureInventoryLevels: ensure, reservationItemService_: { update: async (data) => data }, inventoryLevelService_: { update } }
    const context = { transactionManager: { find: async () => [{ id: "reservation", inventory_item_id: "shared", location_id: "a", quantity: 2 }] } }
    await prototype.updateReservationItems_.call(fake, [{ id: "reservation", quantity: 1, location_id: "b" }], context)
    expect(ensure.mock.calls[0][0].map(({ location_id, quantity }) => ({ location_id, quantity: Number(quantity) }))).toEqual(expect.arrayContaining([{ location_id: "a", quantity: 0 }, { location_id: "b", quantity: 1 }]))
    expect(update.mock.calls[0][0].map((row) => [row.id, Number(row.reserved_quantity)])).toEqual([["level_a", 0], ["level_b", 1]])
  })
  it("permits legitimate negative physical deltas and rejects physical underflow", async () => {
    const update = jest.fn(async (data) => data)
    const fake = { ensureInventoryLevels: async () => [level("a", 2)], inventoryLevelService_: { update } }
    await prototype.adjustInventory_.call(fake, "shared", "a", -1, { transactionManager: {} })
    expect(Number(update.mock.calls[0][0].stocked_quantity)).toBe(1)
    await expect(prototype.adjustInventory_.call(fake, "shared", "a", -3, { transactionManager: {} })).rejects.toThrow("negative")
    expect(update).toHaveBeenCalledTimes(1)
  })
  it("does not restore an ordinary reservation over replacement stock reservations", async () => {
    const rows = [level("a", 1, 1)]
    const update = jest.fn()
    const fake: any = { inventoryLevelService_: { list: async () => rows, update } }
    fake.ensureInventoryLevels = (...args) => prototype.ensureInventoryLevels.call(fake, ...args)
    await expect(prototype.adjustInventoryLevelsForReservations_.call(fake, [{ inventory_item_id: "shared", location_id: "a", quantity: 1, allow_backorder: false }], false, { transactionManager: { find: async () => rows } })).rejects.toThrow("Not enough stock")
    expect(update).not.toHaveBeenCalled()
  })
})

describe("installed fulfillment plan (F15 and split reservations)", () => {
  const order = { items: [{ id: "line", variant: { manage_inventory: true, inventory_items: [{ inventory: { id: "shared" }, required_quantity: 1 }] } }] }
  const plan = (reservations, quantity, location_id = "b") => planFulfillmentInventory({ order, reservations, input: { location_id }, inputItemsMap: { line: { quantity } } }, MathBN, invalid)
  it("keeps the unfulfilled remainder at the original reservation location", () => {
    const result = plan([{ id: "r1", line_item_id: "line", inventory_item_id: "shared", location_id: "a", quantity: 2 }], 1)
    expect(result.toUpdate).toHaveLength(1)
    expect(Number(result.toUpdate[0].quantity)).toBe(1)
    expect(result.toUpdate[0]).not.toHaveProperty("location_id")
    expect(result.inventoryAdjustment.map((row) => [row.location_id, Number(row.adjustment)])).toEqual([["b", -1]])
  })
  it("consumes a split component only once and prefers the selected source", () => {
    const result = plan(["a", "b"].map((location_id) => ({ id: location_id, line_item_id: "line", inventory_item_id: "shared", location_id, quantity: 1 })), 1)
    expect(result.toDelete).toEqual(["b"])
    expect(result.toUpdate).toEqual([])
    expect(result.inventoryAdjustment).toHaveLength(1)
  })
  it("rejects fulfillment beyond the total reserved quantity", () => {
    expect(() => plan([{ id: "r1", line_item_id: "line", inventory_item_id: "shared", location_id: "a", quantity: 1 }], 2)).toThrow("exceeds")
  })
})

describe("installed cart compensation (F3)", () => {
  function nativeUpdateStep() {
    const exports: any = {}
    const workflows = require("@medusajs/framework/workflows-sdk")
    runInNewContext(readFileSync(join(coreDir, "cart/steps/update-carts.js"), "utf8"), {
      exports,
      require: (name: string) => name === "@medusajs/framework/workflows-sdk" ? { StepResponse: workflows.StepResponse, createStep: (_name, invoke, compensate) => ({ invoke, compensate }) } : require(name),
    })
    return exports.updateCartsStep
  }
  async function compensate(input: any, newAddressId: string) {
    const previous = { id: "cart", metadata: {}, shipping_address_id: "old_shipping", billing_address_id: null }
    const updateCarts = jest.fn(async (data) => [{ ...previous, ...data[0], shipping_address_id: newAddressId }])
    const deleteAddresses = jest.fn()
    const cartModule = { listCarts: async () => [previous], listAddresses: async () => [], updateCarts, updateAddresses: jest.fn(), deleteAddresses }
    const context = { container: { resolve: () => cartModule } }
    const step = nativeUpdateStep()
    const response = await step.invoke([{ id: "cart", ...input }], context)
    await step.compensate(response.compensateInput, context)
    return { data: response.compensateInput, updateCarts, deleteAddresses }
  }
  it("restores address links and removes only an address created by this operation", async () => {
    const result = await compensate({ shipping_address: { first_name: "Synthetic" } }, "new_shipping")
    expect(result.data.newAddressIds).toEqual(["new_shipping"])
    expect(result.updateCarts.mock.calls[1][0][0]).toMatchObject({ shipping_address: { id: "old_shipping" }, billing_address: null })
    expect(result.deleteAddresses).toHaveBeenCalledWith(["new_shipping"])
  })
  it.each([{ shipping_address_id: "existing_shipping" }, { shipping_address: { id: "existing_shipping" } }])("keeps a preexisting address when reverting an explicit link", async (input) => {
    const result = await compensate(input, "existing_shipping")
    expect(result.data.newAddressIds).toEqual([])
    expect(result.deleteAddresses).not.toHaveBeenCalled()
  })
})
