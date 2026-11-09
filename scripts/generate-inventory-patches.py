"""Regenerate minimal patches from pristine Medusa 2.22.3 package JS.

Reads installed files only, writes patches only. Refuses already patched input.
Run before installing these patches, or pass --packages <pristine pnpm store>.
"""
from pathlib import Path
import argparse
import difflib

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--packages", type=Path, default=ROOT / "node_modules/.pnpm")
args = parser.parse_args()


def package(name):
    return next(args.packages.glob(f"@medusajs+{name}@2.22.3*")) / f"node_modules/@medusajs/{name}"


def replace(text, before, after):
    assert text.count(before) == 1, f"Expected unique pristine fragment: {before[:90]!r}"
    return text.replace(before, after)


def patch(name, changes):
    result = []
    for path, original, modified in changes:
        result.append(f"diff --git a/{path} b/{path}\n")
        if not original:
            result.append("new file mode 100644\n")
        for line in difflib.unified_diff(original.splitlines(True), modified.splitlines(True), fromfile=f"a/{path}" if original else "/dev/null", tofile=f"b/{path}"):
            result.append(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n")
    (ROOT / f"patches/@medusajs__{name}@2.22.3.patch").write_text("".join(result), encoding="utf-8", newline="\n")


inv = package("inventory")
path = "dist/services/inventory-module.js"
original = (inv / path).read_text(encoding="utf-8")
modified = replace(original, '        options ??= {};', '''        options ??= {};
        // Every caller is inside InjectTransactionManager. Lock before reading
        // counters, including native reservations and calls outside core flows.
        // Refresh bypasses an earlier identity-map snapshot in this transaction.
        const manager = context.transactionManager;
        if (!manager) throw new Error("Inventory mutation requires a transaction");''')
modified = replace(modified, '''        const inventoryLevels = await this.inventoryLevelService_.list({
            $or: [
                { id: idData.filter(({ id }) => !!id).map((e) => e.id) },
                ...itemLocationData,
            ],
        }, {}, context);''', '''        const inventoryLevels = await manager.find((0, utils_1.toMikroORMEntity)(_models_1.InventoryLevel), {
            $or: [
                { id: idData.filter(({ id }) => !!id).map((e) => e.id) },
                ...itemLocationData,
            ],
            deleted_at: null,
        }, { lockMode: 3, refresh: true, orderBy: { id: "ASC" } });''')
start = modified.index('        if (validateQuantityAtLocation) {')
end = modified.index('        return inventoryLevels;', start)
modified = modified[:start] + '''        if (validateQuantityAtLocation) {
            const demand = new Map();
            for (const item of data) {
                if (item.allow_backorder) continue;
                const key = `${item.inventory_item_id}:${item.location_id}`;
                demand.set(key, utils_1.MathBN.add(demand.get(key) ?? 0, item.quantity ?? 0));
            }
            for (const level of inventoryLevels) {
                const quantity = demand.get(`${level.inventory_item_id}:${level.location_id}`) ?? 0;
                const available = utils_1.MathBN.sub(level.raw_stocked_quantity ?? level.stocked_quantity, level.raw_reserved_quantity ?? level.reserved_quantity);
                if (utils_1.MathBN.gt(quantity, 0) && utils_1.MathBN.lt(available, quantity)) {
                    throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, `Not enough stock available for item ${level.inventory_item_id} at location ${level.location_id}`);
                }
            }
        }
''' + modified[end:]
modified = replace(modified, '''    async createReservationItems_(input, context = {}) {
        const inventoryLevels''', '''    async createReservationItems_(input, context = {}) {
        for (const item of input) {
            if (!utils_1.MathBN.gt(item.quantity, 0)) throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Reservation quantity must be positive");
        }
        const inventoryLevels''')
modified = replace(modified, '''    async updateReservationItems_(input, context = {}) {
        const ids = input.map((u) => u.id);
        const reservationItems = await this.reservationItemService_.list({ id: ids }, {}, context);''', '''    async updateReservationItems_(input, context = {}) {
        for (const item of input) {
            if (item.quantity !== undefined && !utils_1.MathBN.gte(item.quantity, 0)) throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Reservation quantity cannot be negative");
        }
        const ids = input.map((u) => u.id);
        if (new Set(ids).size !== ids.length) throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Duplicate reservation updates");
        const reservationItems = await context.transactionManager.find((0, utils_1.toMikroORMEntity)(_models_1.ReservationItem), { id: ids, deleted_at: null }, { lockMode: 3, refresh: true, orderBy: { id: "ASC" } });''')
modified = replace(modified, 'utils_1.MathBN.add(updateLocationAdjustment, update.quantity || reservation.quantity)', 'utils_1.MathBN.add(updateLocationAdjustment, update.quantity ?? reservation.quantity)')
start = modified.index('        const availabilityData = input.map((data) => {')
end = modified.index('        const result = await this.reservationItemService_.update(input, context);', start)
modified = modified[:start] + '''        // Validate the net positive demand per location, not each row in
        // isolation. Include source locations so both saved counters move.
        const availabilityData = [];
        for (const [inventory_item_id, locations] of adjustments) {
            for (const [location_id, quantity] of locations) {
                const relevant = input.filter((data) => {
                    const previous = reservationMap.get(data.id);
                    return previous.inventory_item_id === inventory_item_id && (data.location_id ?? previous.location_id) === location_id;
                });
                const allow_backorder = relevant.length > 0 && relevant.every((data) => data.allow_backorder ?? reservationMap.get(data.id).allow_backorder ?? false);
                availabilityData.push({ inventory_item_id, location_id, quantity: utils_1.MathBN.gt(quantity, 0) ? quantity : 0, allow_backorder });
            }
        }
        const inventoryLevels = await this.ensureInventoryLevels(availabilityData, { validateQuantityAtLocation: true }, context);
''' + modified[end:]
modified = replace(modified, '''        const [inventoryLevel] = await this.inventoryLevelService_.list({ inventory_item_id: inventoryItemId, location_id: locationId }, {}, context);''', '''        const [inventoryLevel] = await this.ensureInventoryLevels([{ inventory_item_id: inventoryItemId, location_id: locationId }], undefined, context);''')
modified = replace(modified, '''        const results = [];
        for (const data of all) {
            const result = await this.adjustInventory_(data.inventoryItemId, data.locationId, data.adjustment, context);
            results.push(result);
        }
        return await this.baseRepository_.serialize(Array.isArray(inventoryItemIdOrData) ? results : results[0]);
    }
    async adjustInventory_''', '''        const results = await this.adjustInventoryBatch_(all, context);
        return await this.baseRepository_.serialize(Array.isArray(inventoryItemIdOrData) ? results : results[0]);
    }
    async adjustInventoryBatch_(all, context = {}) {
        // One transaction owns the entire debit batch. Lock every component in
        // stable row order before the first write, including multi-item kits.
        if (all.length) await this.ensureInventoryLevels(all.map((entry) => ({ inventory_item_id: entry.inventoryItemId, location_id: entry.locationId })), undefined, context);
        const results = [];
        for (const data of all) {
            results.push(await this.adjustInventory_(data.inventoryItemId, data.locationId, data.adjustment, context));
        }
        return results;
    }
    async adjustInventory_''')
modified = replace(modified, '''], InventoryModuleService.prototype, "adjustInventory", null);
__decorate([
    (0, utils_1.InjectTransactionManager)(),''', '''], InventoryModuleService.prototype, "adjustInventory", null);
__decorate([
    (0, utils_1.InjectTransactionManager)(),
    __param(1, (0, utils_1.MedusaContext)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, Object]),
    __metadata("design:returntype", Promise)
], InventoryModuleService.prototype, "adjustInventoryBatch_", null);
__decorate([
    (0, utils_1.InjectTransactionManager)(),''')
modified = replace(modified, '''        const result = await this.inventoryLevelService_.update({
            id: inventoryLevel.id,
            stocked_quantity: utils_1.MathBN.add(inventoryLevel.stocked_quantity, adjustment),''', '''        const stocked = utils_1.MathBN.add(inventoryLevel.raw_stocked_quantity ?? inventoryLevel.stocked_quantity, adjustment);
        // Negative adjustments are legitimate sales/write-offs. The physical
        // balance, unlike available balance with backorders, cannot go below 0.
        if (utils_1.MathBN.lt(stocked, 0)) throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, "Physical inventory cannot be negative");
        const result = await this.inventoryLevelService_.update({
            id: inventoryLevel.id,
            stocked_quantity: stocked,''')
# Serialise deletion/restoration of the same reservation too; otherwise two
# concurrent deletes can both subtract a stale quantity from the level counter.
for selector, deleted in [("id: ids", False), ("location_id: locationId", False), ("line_item_id: lineItemId", False), ("id: ids", True), ("line_item_id: lineItemId", True)]:
    old = f'await this.reservationItemService_.list({{ {selector}' + (', deleted_at: { $ne: null } }, { withDeleted: true }, context)' if deleted else ' }, {}, context)')
    new = f'await context.transactionManager.find((0, utils_1.toMikroORMEntity)(_models_1.ReservationItem), {{ {selector}, deleted_at: ' + ('{ $ne: null }' if deleted else 'null') + ' }, { lockMode: 3, refresh: true, orderBy: { id: "ASC" }, filters: false })'
    assert old in modified, old
    modified = modified.replace(old, new)
modified = replace(modified, '''        const inventoryLevels = await this.ensureInventoryLevels(reservations.map((r) => ({
            inventory_item_id: r.inventory_item_id,
            location_id: r.location_id,
        })), undefined, context);''', '''        const inventoryLevels = await this.ensureInventoryLevels(reservations.map((r) => ({
            inventory_item_id: r.inventory_item_id,
            location_id: r.location_id,
            quantity: isDelete ? 0 : r.quantity,
            allow_backorder: r.allow_backorder,
        })), { validateQuantityAtLocation: !isDelete }, context);''')
patch("inventory", [(path, original, modified)])

core = package("core-flows")
changes = []


def edit(path, fn):
    original = (core / path).read_text(encoding="utf-8")
    changes.append((path, original, fn(original)))


allocation = (ROOT / "patches/sources/allocate-reservations.cjs").read_text(encoding="utf-8")
fulfillment = (ROOT / "patches/sources/fulfillment-inventory.cjs").read_text(encoding="utf-8")
changes.extend([
    ("dist/cart/utils/allocate-reservations.js", "", allocation),
    ("dist/order/utils/fulfillment-inventory.js", "", fulfillment),
])


def reserve(text):
    text = replace(text, 'const utils_1 = require("@medusajs/framework/utils");', 'const utils_1 = require("@medusajs/framework/utils");\nconst { allocateReservations } = require("../utils/allocate-reservations");')
    start = text.index('    const inventoryItemIds = [];')
    end = text.index('    return new workflows_sdk_1.StepResponse(reservations,', start)
    return text[:start] + '''    const inventoryItemIds = data.items.map((item) => item.inventory_item_id);
    const lockingKeys = Array.from(new Set(inventoryItemIds)).sort();
    const reservations = await locking.execute(lockingKeys, async () => {
        const levels = await inventoryService.listInventoryLevels({ inventory_item_id: lockingKeys }, { take: null });
        const items = allocateReservations(data.items, levels, utils_1.MathBN, (message) => new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, message, utils_1.MedusaError.Codes.INSUFFICIENT_INVENTORY));
        // The module rechecks aggregate demand under PostgreSQL row locks.
        return await inventoryService.createReservationItems(items);
    });
''' + text[end:]


edit("dist/cart/steps/reserve-inventory.js", reserve)


def confirm(text):
    text = replace(text, 'const utils_1 = require("@medusajs/framework/utils");', 'const utils_1 = require("@medusajs/framework/utils");\nconst { allocateReservations } = require("../utils/allocate-reservations");')
    start = text.index('    // TODO: Should be bulk')
    end = text.index('    return new workflows_sdk_1.StepResponse(null);', start)
    return text[:start] + '''    const ids = [...new Set(data.items.map((item) => item.inventory_item_id))];
    const levels = await inventoryService.listInventoryLevels({ inventory_item_id: ids }, { take: null });
    allocateReservations(data.items, levels, utils_1.MathBN, (message) => new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, message, utils_1.MedusaError.Codes.INSUFFICIENT_INVENTORY));
''' + text[end:]


edit("dist/cart/steps/confirm-inventory.js", confirm)
edit("dist/cart/utils/prepare-confirm-inventory-input.js", lambda text: replace(text, '''                location_ids: locationsWithAvailability.length
                    ? locationsWithAvailability
                    : locationsWithLevel.length
                        ? locationsWithLevel
                        : location_ids,''', '''                location_ids: locationsWithLevel.length ? locationsWithLevel : location_ids,'''))


def complete_cart(text):
    text = replace(text, 'fields: ["id", "shipping_profile_id"],', 'fields: ["id", "shipping_profile_id", "service_zone.fulfillment_set.type", "service_zone.fulfillment_set.location.id"],')
    text = replace(text, '''        const formatedInventoryItems = (0, workflows_sdk_1.transform)({
            input: {
                sales_channel_id,
                variants,
                items: reservationItemsData,
            },
        }, prepare_confirm_inventory_input_1.prepareConfirmInventoryInput);''', '''        const formatedInventoryItems = (0, workflows_sdk_1.transform)({
            input: {
                sales_channel_id,
                variants,
                items: reservationItemsData,
            },
            shippingOptions: shippingOptionsData.data,
        }, (data) => {
            const formatted = (0, prepare_confirm_inventory_input_1.prepareConfirmInventoryInput)(data);
            const pickups = data.shippingOptions.filter((option) => option.service_zone?.fulfillment_set?.type === "pickup");
            if (pickups.length) {
                const locations = new Set(pickups.map((option) => option.service_zone.fulfillment_set.location?.id).filter(Boolean));
                formatted.items.forEach((item) => { item.location_ids = item.location_ids.filter((id) => locations.has(id)); });
            }
            return formatted;
        });''')
    return text


edit("dist/cart/workflows/complete-cart.js", complete_cart)


def fulfill(text):
    text = replace(text, 'const order_validation_1 = require("../utils/order-validation");', 'const order_validation_1 = require("../utils/order-validation");\nconst { planFulfillmentInventory } = require("../utils/fulfillment-inventory");')
    text = replace(text, '        return reservations.map((r) => {', '        return [...new Map(reservations.map((r) => [r.inventory_item_id, r])).values()].map((r) => {')
    start = text.index('function prepareInventoryUpdate(')
    end = text.index('exports.createOrderFulfillmentWorkflowId =', start)
    text = text[:start] + '''function prepareInventoryUpdate(data) {
    return planFulfillmentInventory(data, utils_1.MathBN, (message) => new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, message));
}
''' + text[end:]
    # Default dispatch consumes the reservation's actual component sources;
    # explicitly selected location overrides them and is checked physically.
    text = replace(text, '            metadata: input.metadata,', '''            metadata: {
                ...input.metadata,
                inventory_sources: planFulfillmentInventory({ reservations, order, input, inputItemsMap: Object.fromEntries(input.items.map((item) => [item.id, item])), itemsList }, utils_1.MathBN, (message) => new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, message)).inventoryAdjustment.map((entry) => ({ inventory_item_id: entry.inventory_item_id, location_id: entry.location_id, quantity: utils_1.MathBN.mult(entry.adjustment, -1) })),
            },''')
    return text


edit("dist/order/workflows/create-fulfillment.js", fulfill)


def complete_orders(text):
    text = replace(text, 'const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");', 'const workflows_sdk_1 = require("@medusajs/framework/workflows-sdk");\nconst { getLastPaymentStatus } = require("../utils/aggregate-status");')
    text = replace(text, '    const completed = await service.completeOrder(data.orderIds);', '''    const query = container.resolve(utils_1.ContainerRegistrationKeys.QUERY);
    const { data: details } = await query.graph({ entity: "order", fields: ["id", "metadata", "status", "total", "items.quantity", "items.requires_shipping", "items.detail.delivered_quantity", "payment_collections.*"], filters: { id: data.orderIds } });
    for (const order of details) {
        if (!order.metadata?.texno_order || order.status === "completed") continue;
        if (!utils_1.MathBN.eq(order.total, 0) && getLastPaymentStatus(order) !== "captured") throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, "Сначала отметьте полную оплату заказа");
        if (order.items?.some((item) => item.requires_shipping && utils_1.MathBN.lt(item.detail?.delivered_quantity ?? 0, item.quantity))) throw new utils_1.MedusaError(utils_1.MedusaError.Types.NOT_ALLOWED, "Сначала отметьте доставку или выдачу всех товаров");
    }
    const completed = await service.completeOrder(data.orderIds);''')
    return text


edit("dist/order/steps/complete-orders.js", complete_orders)


def update_carts(text):
    text = replace(text, '''            "completed_at",
        ],''', '''            "completed_at",
            "shipping_address_id",
            "billing_address_id",
        ],''')
    text = replace(text, '''        id: addressesToUpdate.map((address) => address.id),''', '''        id: [...new Set([...addressesToUpdate.map((address) => address.id), ...cartsBeforeUpdate.flatMap((cart) => [cart.shipping_address_id, cart.billing_address_id]).filter(Boolean)])],''')
    text = replace(text, '''    const updatedCart = await cartModule.updateCarts(data);
    return new workflows_sdk_1.StepResponse(updatedCart, {
        cartsBeforeUpdate,
        addressesBeforeUpdate,
    });''', '''    const updatedCart = await cartModule.updateCarts(data);
    const previousAddressIds = new Set(cartsBeforeUpdate.flatMap((cart) => [cart.shipping_address_id, cart.billing_address_id]).filter(Boolean));
    const newAddressIds = [...new Set(data.flatMap((input) => {
        const cart = updatedCart.find((row) => row.id === input.id);
        return ["shipping_address", "billing_address"].filter((key) => input[key] && !input[key].id).map((key) => cart?.[`${key}_id`]);
    }).filter((id) => id && !previousAddressIds.has(id)))];
    return new workflows_sdk_1.StepResponse(updatedCart, {
        cartsBeforeUpdate,
        addressesBeforeUpdate,
        newAddressIds,
    });''')
    text = replace(text, 'const { cartsBeforeUpdate, addressesBeforeUpdate } = dataToCompensate;', 'const { cartsBeforeUpdate, addressesBeforeUpdate, newAddressIds } = dataToCompensate;')
    text = replace(text, '''            completed_at: cart.completed_at,
        });''', '''            completed_at: cart.completed_at,
            shipping_address: cart.shipping_address_id ? { id: cart.shipping_address_id } : null,
            billing_address: cart.billing_address_id ? { id: cart.billing_address_id } : null,
        });''')
    text = replace(text, '    return await cartModule.updateCarts(dataToUpdate);', '''    const restored = await cartModule.updateCarts(dataToUpdate);
    if (newAddressIds?.length) await cartModule.deleteAddresses(newAddressIds);
    return restored;''')
    return text


edit("dist/cart/steps/update-carts.js", update_carts)
patch("core-flows", changes)
print("Generated pinned inventory/core-flows patches")
