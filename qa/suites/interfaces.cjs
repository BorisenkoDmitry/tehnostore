const path = require("node:path")

module.exports = async function interfaceSuite(C) {
  const { ok, ar, check, db, track, fs, runId } = C
  const proofFile = process.env.QA_UI_RESULT_FILE
  if (proofFile) {
    const proof = JSON.parse(fs.readFileSync(proofFile, "utf8"))
    if (proof.project !== C.target.project || proof.source_manifest_sha256 !== C.report.runtime.source_manifest_sha256) throw Error("Browser proof does not match this runtime/project")
    if (!Array.isArray(proof.cases) || !proof.cases.length || !proof.orders) throw Error("Incomplete UI proof")
    C.report.cases.push(...proof.cases)
    const ids = Object.values(proof.orders).map((order) => order.id)
    const pending = (await db.query("SELECT id,order_id,status,change_type FROM order_change WHERE order_id=ANY($1) AND deleted_at IS NULL AND status='pending'", [ids])).rows
    check("F12-independent-db-no-pending-drafts", pending.length === 0, { pending })
    const claims = (await db.query("SELECT count(*)::int count FROM order_claim WHERE order_id=$1 AND deleted_at IS NULL AND canceled_at IS NULL", [proof.orders.claim.id])).rows[0].count
    const exchanges = (await db.query("SELECT count(*)::int count FROM order_exchange WHERE order_id=$1 AND deleted_at IS NULL AND canceled_at IS NULL", [proof.orders.exchange.id])).rows[0].count
    check("F12-independent-db-confirmed-claim", claims === 1, { count: claims })
    check("F12-independent-db-confirmed-exchange", exchanges === 1, { count: exchanges })
    const leads = (await db.query("SELECT id,status FROM content_lead WHERE message=$1 AND deleted_at IS NULL", ["Synthetic contact UI " + proof.fixtureRunId])).rows
    check("F14-contact-submit-independent-db", leads.length === 1 && leads[0].status === "new", { count: leads.length })
    if (leads.length === 1) {
      track("content_lead", leads[0].id)
      for (const status of ["in_progress", "closed"]) {
        ok(await ar("/content/leads/" + leads[0].id, "POST", { status, notes: "Synthetic QA state" }))
        check("F14-contact-lead-" + status, (await db.query("SELECT status FROM content_lead WHERE id=$1", [leads[0].id])).rows[0]?.status === status)
      }
    }
    const customers = (await db.query("SELECT id FROM customer WHERE email=$1 AND deleted_at IS NULL", ["buyer-" + proof.fixtureRunId + "@example.test"])).rows
    check("F16-browser-registration-independent-db", customers.length === 1)
    if (customers.length === 1) {
      track("customer", customers[0].id)
      const nonempty = (await db.query("SELECT c.id,count(li.id)::int lines FROM cart c JOIN cart_line_item li ON li.cart_id=c.id AND li.deleted_at IS NULL WHERE c.customer_id=$1 AND c.deleted_at IS NULL AND c.completed_at IS NULL GROUP BY c.id", [customers[0].id])).rows
      check("F16-saved-cart-retained-in-db", nonempty.some((cart) => cart.lines > 0), { nonempty_carts: nonempty.length })
    }
    return
  }
  const F = C.fixture || await require("../lib/fixture.cjs")(C)
  const axes = F.axes
  const values = axes.map((axis, index) => axis.choice_values.slice(0, index ? 1 : 2))
  const inventory = []
  for (const index of [0, 1]) {
    const item = ok(await ar("/inventory-items", "POST", { sku: "UI-" + runId + "-" + index, title: "Synthetic UI inventory " + index })).inventory_item
    track("inventory_item", item.id)
    inventory.push(item)
  }
  const product = ok(await ar("/products", "POST", {
    title: "UI remediation " + runId, handle: "ui-remediation-" + runId,
    status: "published", sales_channels: [{ id: F.channel }], shipping_profile_id: F.shippingProfile,
    options: axes.map((axis, index) => ({ title: axis.label, values: values[index] })),
    variants: values[0].map((value, index) => ({ title: "UI " + index, sku: "UI-" + runId + "-" + index, options: Object.fromEntries(axes.map((axis, n) => [axis.label, n ? values[n][0] : value])), manage_inventory: true, allow_backorder: false, inventory_items: [{ inventory_item_id: inventory[index].id, required_quantity: 1 }], prices: [{ currency_code: "rub", amount: 1000 }] })),
  })).product
  track("product", product.id)
  const variants = product.variants.sort((a, b) => a.sku.localeCompare(b.sku))
  variants.forEach((variant) => track("variant", variant.id))
  const cms = { ...F.cms, variants: variants.map((variant) => ({ id: variant.id, old_price: null, attributes: [] })) }
  ok(await ar("/catalog-cms/products/" + product.id, "POST", cms))
  const stock = (id, quantities) => require("../lib/fixture-stock.cjs")(C, product, id, F.locations, quantities)
  await stock(variants[0].id, [1000, 1000])
  // Two confirmed Exchange/Claim replacements leave one unit. The browser
  // fixture then creates two one-unit guest carts; merging them must fail
  // safely and keep both choices available.
  await stock(variants[1].id, [3, 0])
  const orders = {}
  for (const kind of ["edit", "exchange", "claim"]) {
    const quantity = kind === "edit" ? 1 : 40
    const cart = await F.cart(variants[0].id, quantity)
    const order = ok(await F.checkout(cart)).order
    const detail = ok(await ar("/orders/" + order.id + "?fields=id,total,*items,*payment_collections,*payment_collections.payments,*fulfillments")).order
    const line = detail.items.find((item) => item.variant_id === variants[0].id)
    orders[kind] = { id: order.id, line: line.id, quantity }
    if (kind !== "edit") {
      const payment = detail.payment_collections.flatMap((collection) => collection.payments)[0]
      ok(await ar("/payments/" + payment.id + "/capture", "POST", { amount: detail.total }))
      ok(await ar("/orders/" + order.id + "/fulfillments", "POST", { items: [{ id: line.id, quantity }], location_id: F.locations[0].id, no_notification: true }))
      const fulfilled = ok(await ar("/orders/" + order.id + "?fields=id,*fulfillments")).order.fulfillments[0]
      ok(await ar("/orders/" + order.id + "/fulfillments/" + fulfilled.id + "/shipments", "POST", { items: [{ id: line.id, quantity }], no_notification: true }))
      ok(await ar("/orders/" + order.id + "/fulfillments/" + fulfilled.id + "/mark-as-delivered", "POST", { no_notification: true }))
    }
  }
  const draft = ok(await ar("/content/pages", "POST", { slug: "preview-" + runId, title: "UI preview " + runId, body: [{ type: "paragraph", text: "Synthetic preview" }], blocks: [], metadata: {} })).page
  track("content_page", draft.id)
  const legal = {}
  for (const kind of ["privacy", "consent"]) {
    const slug = "remediation-" + kind + "-" + runId
    const page = ok(await ar("/content/pages", "POST", { slug, title: "Synthetic " + kind, body: [{ type: "paragraph", text: "Synthetic QA document" }], blocks: [], metadata: {} })).page
    track("content_page", page.id)
    ok(await ar("/content/pages/" + page.id + "/publish", "POST", {}))
    legal[kind] = slug
  }
  const settings = ok(await ar("/content/settings")).settings
  ok(await ar("/content/settings", "POST", { data: { ...settings.data, legal: { ...settings.data.legal, privacy_slug: legal.privacy, personal_data_slug: legal.consent } }, expected_revision: settings.revision }))
  ok(await ar("/content/settings/publish", "POST", {}))
  const profile = ok(await ar("/catalog-cms/profile"))
  const country = profile.regions.find((region) => region.id === profile.profile.region_id)?.countries?.[0]?.iso_2
  check("F13-profile-supplies-real-country", country === F.region.countries[0].iso_2 && /^[a-z]{2}$/.test(country))
  const option = ok(await ar("/shipping-options?limit=100")).shipping_options.find((option) => option.id === F.pickup.shipping_option_id)
  const fixture = { project: C.target.project, source_manifest_sha256: C.report.runtime.source_manifest_sha256, fixtureRunId: runId, country, orders, product: { id: product.id, handle: product.handle, variants: variants.map(({ id, sku }) => ({ id, sku })) }, draft: { id: draft.id, title: draft.title, slug: draft.slug }, legal, locationName: F.locations[0].name, shippingOptionName: option?.name }
  const destination = process.env.QA_UI_FIXTURE_FILE || path.join("/tmp/remediation-results", "ui-fixture-" + runId + ".json")
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, JSON.stringify(fixture, null, 2))
  C.report.ui_fixture = destination
  C.blocked("F12-F13-F14-F16-F17-browser", "UI fixtures prepared. Run qa/ui/run.cjs on Windows, then rerun with QA_UI_RESULT_FILE matching the runtime source manifest.")
}
