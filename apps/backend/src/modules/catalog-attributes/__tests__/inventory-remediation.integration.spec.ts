import { randomUUID } from "node:crypto"
import { dirname, join } from "node:path"
import { Client } from "@medusajs/framework/pg"
import type { IInventoryService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { discoveryPath } from "@medusajs/medusa/inventory"

// The Medusa runner creates/drops this suite's own schema. Refuse to construct
// it unless the parent connection is one of the explicitly isolated projects.
const targets: Record<string, string> = {
  cms_remediation_fixed_20261109: "cms-remediation-fixed-20261109",
  cms_remediation_restored_20261109: "cms-remediation-restored-20261109",
}
const parent = new URL(process.env.DATABASE_URL || "http://invalid")
const parentDatabase = parent.pathname.slice(1)
if (parent.protocol !== "postgresql:" || parent.hostname !== "db" || parent.username !== "clothing_runner" || targets[parentDatabase] !== process.env.QA_PROJECT) throw new Error("Inventory module tests require an exact isolated remediation project/database pair")
for (const [name, expected] of Object.entries({ DB_HOST: parent.hostname, DB_PORT: parent.port || "5432", DB_USERNAME: parent.username, DB_PASSWORD: decodeURIComponent(parent.password) })) {
  if (process.env[name] !== undefined && process.env[name] !== expected) throw new Error("Module test connection disagrees with the guarded target")
  process.env[name] = expected
}
const dbName = "medusa-remediation-inventory-" + randomUUID().replaceAll("-", "")
const inventoryDirectory = dirname(discoveryPath)

moduleIntegrationTestRunner<IInventoryService>({
  moduleName: Modules.INVENTORY,
  resolve: inventoryDirectory,
  pathToMigrations: join(inventoryDirectory, "migrations"),
  dbName,
  testSuite: ({ service, dbConfig }) => {
    async function stock(quantity = 1) {
      const inventory = await service.createInventoryItems({ sku: "module-" + randomUUID(), title: "Synthetic inventory module fixture" })
      await service.createInventoryLevels([
        { inventory_item_id: inventory.id, location_id: "synthetic_a", stocked_quantity: quantity },
        { inventory_item_id: inventory.id, location_id: "synthetic_b", stocked_quantity: quantity },
      ])
      return inventory.id
    }
    const reservation = (inventory_item_id: string, quantity = 1, location_id = "synthetic_a", allow_backorder = false) => ({ inventory_item_id, location_id, quantity, allow_backorder, line_item_id: "synthetic_line_" + randomUUID() })
    async function proof(id: string) {
      const connection = new Client({ connectionString: dbConfig.clientUrl })
      await connection.connect()
      try {
        await connection.query("BEGIN READ ONLY")
        const identity = (await connection.query("SELECT current_database() name,current_setting('transaction_read_only') read_only")).rows[0]
        expect(identity).toEqual({ name: dbName, read_only: "on" })
        const levels = (await connection.query("SELECT l.location_id,l.stocked_quantity::text stocked,l.reserved_quantity::text reserved,(SELECT coalesce(sum(r.quantity),0)::text FROM reservation_item r WHERE r.inventory_item_id=l.inventory_item_id AND r.location_id=l.location_id AND r.deleted_at IS NULL) actual_reserved FROM inventory_level l WHERE l.inventory_item_id=$1 AND l.deleted_at IS NULL ORDER BY l.location_id", [id])).rows
        const reservations = (await connection.query("SELECT id,location_id,quantity::text quantity,allow_backorder FROM reservation_item WHERE inventory_item_id=$1 AND deleted_at IS NULL ORDER BY id", [id])).rows
        await connection.query("ROLLBACK")
        for (const level of levels) expect(Number(level.reserved)).toBe(Number(level.actual_reserved))
        return { levels, reservations }
      } finally { await connection.end() }
    }

    it("F1: atomically rejects a batch sharing one inventory item beyond its stock", async () => {
      const id = await stock()
      await expect(service.createReservationItems([reservation(id), reservation(id)])).rejects.toThrow()
      const result = await proof(id)
      expect(result.reservations).toHaveLength(0)
      expect(result.levels.map((level) => Number(level.reserved))).toEqual([0, 0])
    })

    it("F1: twenty concurrent writers can reserve the last physical unit once", async () => {
      const id = await stock()
      const results = await Promise.allSettled(Array.from({ length: 20 }, () => service.createReservationItems(reservation(id))))
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(19)
      const result = await proof(id)
      expect(result.reservations).toHaveLength(1)
      expect(result.levels.map((level) => Number(level.reserved))).toEqual([1, 0])
    })

    it("F4: invalid create/update quantities leave native rows and counters unchanged", async () => {
      const id = await stock(5)
      for (const quantity of [-1, 0]) await expect(service.createReservationItems(reservation(id, quantity))).rejects.toThrow()
      const created = await service.createReservationItems(reservation(id))
      const before = await proof(id)
      await expect(service.updateReservationItems({ id: created.id, quantity: -1 })).rejects.toThrow()
      expect(await proof(id)).toEqual(before)
      await service.updateReservationItems({ id: created.id, quantity: 0 })
      expect((await proof(id)).levels.map((level) => Number(level.reserved))).toEqual([0, 0])
    })

    it("F15: reducing and moving a native reservation updates source and destination", async () => {
      const id = await stock(5)
      const created = await service.createReservationItems(reservation(id, 3))
      await service.updateReservationItems({ id: created.id, location_id: "synthetic_b", quantity: 1 })
      const result = await proof(id)
      expect(result.reservations.map((row) => [row.location_id, Number(row.quantity)])).toEqual([["synthetic_b", 1]])
      expect(result.levels.map((level) => Number(level.reserved))).toEqual([0, 1])
    })

    it("F15: twenty concurrent reservation moves preserve both stored counters", async () => {
      const id = await stock(20)
      const created = await service.createReservationItems(Array.from({ length: 20 }, () => reservation(id)))
      const results = await Promise.allSettled(created.map((row) => service.updateReservationItems({ id: row.id, location_id: "synthetic_b" })))
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(0)
      const result = await proof(id)
      expect(result.levels.map((level) => Number(level.reserved))).toEqual([0, 20])
      expect(result.reservations).toHaveLength(20)
    })

    it("F1: concurrent duplicate deletes release a reservation exactly once", async () => {
      const id = await stock()
      const created = await service.createReservationItems(reservation(id))
      await Promise.all(Array.from({ length: 20 }, () => service.deleteReservationItems([created.id])))
      const result = await proof(id)
      expect(result.reservations).toHaveLength(0)
      expect(result.levels.map((level) => Number(level.reserved))).toEqual([0, 0])
    })

    it("F1: soft-delete/restore cannot oversell stock reserved in the meantime", async () => {
      const id = await stock()
      const first = await service.createReservationItems(reservation(id))
      await service.softDeleteReservationItems([first.id])
      const second = await service.createReservationItems(reservation(id))
      await expect(service.restoreReservationItems([first.id])).rejects.toThrow()
      const result = await proof(id)
      expect(result.reservations.map((row) => row.id)).toEqual([second.id])
      expect(result.levels.map((level) => Number(level.reserved))).toEqual([1, 0])
    })

    it("F1: concurrent restores reactivate and count a reservation once", async () => {
      const id = await stock()
      const created = await service.createReservationItems(reservation(id))
      await service.softDeleteReservationItems([created.id])
      await Promise.all(Array.from({ length: 20 }, () => service.restoreReservationItems([created.id])))
      const result = await proof(id)
      expect(result.reservations).toHaveLength(1)
      expect(result.levels.map((level) => Number(level.reserved))).toEqual([1, 0])
    })

    it("F1: explicit backorders may exceed available stock and restore as configured", async () => {
      const id = await stock()
      const backorder = await service.createReservationItems(reservation(id, 2, "synthetic_a", true))
      await service.softDeleteReservationItems([backorder.id])
      await service.createReservationItems(reservation(id))
      await service.restoreReservationItems([backorder.id])
      const result = await proof(id)
      expect(result.reservations).toHaveLength(2)
      expect(result.levels.map((level) => Number(level.reserved))).toEqual([3, 0])
    })

    it("F1: twenty concurrent physical decrements do not lose writes or go below zero", async () => {
      const id = await stock(20)
      const results = await Promise.allSettled(Array.from({ length: 20 }, () => service.adjustInventory(id, "synthetic_a", -1)))
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(0)
      const result = await proof(id)
      expect(result.levels.map((level) => Number(level.stocked))).toEqual([0, 20])
      await expect(service.adjustInventory(id, "synthetic_a", -1)).rejects.toThrow()
      expect(await proof(id)).toEqual(result)
    })

    it("F1: a failing batch physical adjustment rolls back earlier component debits", async () => {
      const id = await stock()
      const before = await proof(id)
      await expect(service.adjustInventory([
        { inventoryItemId: id, locationId: "synthetic_a", adjustment: -1 },
        { inventoryItemId: id, locationId: "synthetic_b", adjustment: -2 },
      ])).rejects.toThrow()
      expect(await proof(id)).toEqual(before)
    })
  },
})

jest.setTimeout(120 * 1000)
