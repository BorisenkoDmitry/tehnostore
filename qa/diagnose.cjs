const path = require("node:path")
const {createContext} = require("./lib/context.cjs")
const C = createContext()
async function main() {
  await C.init()
  const rows = (await C.db.query(`SELECT l.id,l.inventory_item_id,l.location_id,l.stocked_quantity::text stocked,l.reserved_quantity::text cached_reserved,coalesce((SELECT sum(r.quantity) FROM reservation_item r WHERE r.inventory_item_id=l.inventory_item_id AND r.location_id=l.location_id AND r.deleted_at IS NULL),0)::text actual_reserved,ARRAY(SELECT r.id FROM reservation_item r WHERE r.inventory_item_id=l.inventory_item_id AND r.location_id=l.location_id AND r.deleted_at IS NULL ORDER BY r.id) reservation_ids,ARRAY(SELECT distinct oi.order_id FROM reservation_item r JOIN order_item oi ON oi.item_id=r.line_item_id AND oi.deleted_at IS NULL WHERE r.inventory_item_id=l.inventory_item_id AND r.location_id=l.location_id AND r.deleted_at IS NULL ORDER BY oi.order_id) order_ids FROM inventory_level l WHERE l.deleted_at IS NULL AND (l.reserved_quantity<>coalesce((SELECT sum(r.quantity) FROM reservation_item r WHERE r.inventory_item_id=l.inventory_item_id AND r.location_id=l.location_id AND r.deleted_at IS NULL),0) OR l.stocked_quantity<0 OR EXISTS(SELECT 1 FROM reservation_item r WHERE r.inventory_item_id=l.inventory_item_id AND r.location_id=l.location_id AND r.deleted_at IS NULL AND r.quantity<0)) ORDER BY l.id`)).rows
  C.report.diagnostics = rows
  C.report.repair_policy = "Dry-run only. Each discrepancy needs an exact inventory/location plan, backup and verified reservation/order ownership. Negative physical stock is preserved for investigation; no blanket zeroing."
  C.check("READ-ONLY-CENSUS",true,{discrepancies:rows.length,negative_physical:rows.filter(row=>Number(row.stocked)<0).length})
}
main().catch(error=>C.blocked("DIAGNOSTICS",error.message)).finally(()=>C.finish(process.env.QA_RESULT_FILE || path.join("/tmp/remediation-results","diagnostics-"+C.runId+".json")))
