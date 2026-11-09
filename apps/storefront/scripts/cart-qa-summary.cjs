const fs = require("node:fs")
const path = require("node:path")
const root = path.resolve(__dirname, "../../..")
const output = path.join(root, "output")
const files = [
  ["API ownership, stock, prices, schema, increments and quotes", "cart-qa-api.json"],
  ["Empty cart responsive/accessibility", "cart-qa-empty-surface.json"],
  ["Complete cart UI lifecycle and all shipping/service options", "cart-qa-ui-flow.json"],
  ["Actual fixture checkout and successful-action replay", "cart-qa-checkout.json"],
  ["Two-guest fixture inventory race", "cart-qa-race.json"],
  ["Native order access protection", "cart-qa-order-security.json"],
  ["Real-product keyboard, touch, motion and screenshots", "cart-qa-real-captures.json"],
  ["PDP selected color/storage, tabs and catalog regression", "cart-qa-pdp-regression.json"],
  ["Browser transport failures for add/quantity/quote/checkout/clear", "cart-qa-network-actions.json"],
  ["Response lost after successful server add, then retry", "cart-qa-response-loss.json"],
  ["Native no-JavaScript add, Origin and checkout privacy guards", "cart-qa-nojs.json"],
  ["Final updated desktop/mobile captures", "cart-qa-final-captures.json"],
  ["Final local routes and real legal redirects", "cart-qa-route-smoke.json"],
  ["Final visible no-JavaScript notice and guest-cart privacy integration", "cart-qa-final-privacy.json"],
]
const suites = files.map(([scope, file]) => {
  const report = JSON.parse(fs.readFileSync(path.join(output, file), "utf8"))
  const counts = report.checks.reduce((result, row) => { result[row.status] = (result[row.status] || 0) + 1; return result }, {})
  return { scope, file, generated_at: report.generated_at, counts, ...(report.error ? { error: report.error } : {}) }
})
const summary = {
  generated_at: new Date().toISOString(),
  generated_at_moscow: new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "medium" }).format(new Date()),
  status: "PASS_WITH_DECLARED_LIMITATIONS",
  scope: "Local TEXNO STORE cart/checkout verification. CMS coverage is in the separate CMS audit artifact. Per-suite assertions are reported separately; they are not a claim that every catalog variant or every combination was exercised.",
  browser: "Headless Chromium only; isolated guest contexts; 320,390,768,1440 pixel widths; no visible Chrome windows",
  suites,
  critical_outcomes: [
    "Actual selected variants and server RUB amounts remain correct through add, quantity updates, reload and navigation.",
    "Unknown-stock fixture cannot be added in UI or API; quantity is capped by actual stock; native cart routes cannot bypass protected purchase guards.",
    "Concurrent increments serialize, retries reuse UUIDs, and a browser response lost after successful server processing does not add an extra unit.",
    "All nine shipping choices and six opt-in services were exercised in the UI. Fixed prices, ranges and uncalculated CDEK are distinguished.",
    "A real UI fixture checkout saved order #1 for2289 RUB with optional email blank, Moscow299 and real service lines200+290. No capture or online payment.",
    "Replaying the same successful checkout action returns the same order. Two guest checkouts each requesting2 of stock2 create only one order; losing guest is blocked and can clear unavailable rows.",
    "Browser request failures for every cart mutation release pending controls, display Russian inline errors, preserve input and support safe retries.",
    "Real products were added only for screenshots and non-completing tests, then carts were cleared. Rechecked confirmed inventory remains100 for both screenshot products.",
  ],
  actual_fixture_orders: [
    { id: "order_01M6SVH6XT4ZPVP213CTTNKAXM", display_id: 1, total: 2289, tested: "Moscow delivery, SIM and protection services, blank optional email, cash preference, unpaid confirmation and successful retry" },
    { id: "order_01M6SVJNV5E0MRRNE24AJ8QXXX", display_id: 2, total: 3400, tested: "One successful white-variant qty2 order from a two-guest stock race" },
  ],
  backend_evidence: "cart-order-backend-verification.log (two pending RUB orders, manually authorized payment collections, captures empty, no fake email). Cancellation/fixture removal is owned by the backend cleanup workflow; see its final cleanup report.",
  screenshots: {
    desktop: "cart-qa-final-desktop.png", desktop_fold: "cart-qa-final-desktop-fold.png",
    mobile: "cart-qa-final-mobile.png", mobile_fold: "cart-qa-final-mobile-fold.png",
    fixture_confirmation_desktop: "cart-qa-confirmation-desktop.png", fixture_confirmation_mobile: "cart-qa-confirmation-mobile.png",
  },
  available_real_products: JSON.parse(fs.readFileSync(path.join(output, "cart-qa-real-products.json"), "utf8")),
  declared_limitations: [
    { status: "NOTAVAILABLE", area: "Cart view and checkout without JavaScript", detail: "Native selected-variant add and UUID retry are supported. Next streamed cart content is inside a hidden S:0 boundary without JavaScript. The application explicitly displays a JavaScript requirement notice outside that boundary. Checkout native POST safely returns400 without putting contact fields into a URL. The historical visibility assertion remains FAIL in cart-qa-nojs.json; final notice/privacy checks PASS in cart-qa-final-privacy.json." },
    { status: "NOTAVAILABLE", area: "Online acquiring", detail: "Explicitly deferred by the user. No card details, real captures or external payments were used." },
    { status: "NOTCHECKED", area: "Every product/variant and permission role combination", detail: "Representative real phone/accessory flows, dedicated known/unknown-stock fixtures, guest isolation, native-route authorization and critical races were exercised. This is not a browser check of every catalog variant or every administrative role." },
    { status: "NOTCHECKED", area: "Every shipping/payment combination as a saved order", detail: "All shipping/service UI selections and server quote rules were checked. Actual saved fixture orders covered cash with fixed Moscow delivery and no-delivery. Card preference and range/CDEK configuration were checked as UI/options/server rules, without creating additional orders for every combination." },
  ],
  historical_findings: [
    { status: "FIXED", issue: "Browser transport rejection left add pending and raised a Next error overlay", before: "cart-qa-network.json", after: "cart-qa-network-actions.json" },
    { status: "FIXED", issue: "Stale forced product cache hid CMS changes", evidence: "PDP no-store change, CMS save/reload audit and final PDP regression" },
    { status: "FIXED", issue: "Reviews navigation returned404 and legal pages were placeholders", before: "cart-qa-baseline.json", after: "cart-qa-route-smoke.json" },
    { status: "FIXED", issue: "Native no-JavaScript checkout could default to GET", evidence: "cart-qa-nojs.json checkout POST/disabled/fallback guards and cart-qa-final-privacy.json visible notice" },
  ],
  safety: "Only local services were used. Actual orders used marked synthetic fixture inventory and synthetic contacts. Real product checkout requests were never allowed to reach the server. No production deployment, real payment, external fulfillment or outbound message was performed. Earlier pre-implementation and interrupted/HMR artifacts are historical and do not replace the final passing reports.",
}
fs.writeFileSync(path.join(output, "cart-qa-summary.json"), JSON.stringify(summary, null, 2))
console.log(JSON.stringify({ status: summary.status, suites: suites.length, failures: suites.filter(suite => suite.counts.FAIL).map(suite => ({ file: suite.file, failures: suite.counts.FAIL })) }))
