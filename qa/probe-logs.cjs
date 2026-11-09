const path = require("node:path")
const root = process.env.CMS_QA_ROOT || path.resolve(__dirname, "..")
const { createContext } = require(path.join(root, "qa/lib/context.cjs"))
const C = createContext()
const destination = process.env.QA_RESULT_FILE || `/tmp/security-log-probes-${C.runId}.json`

async function main() {
  await C.init()
  const marker = `SYNTHETIC_SECRET_${C.runId}`
  const publicCorrelation = `QA-PUBLIC-${C.runId}`
  C.report.log_probe = { started_at: new Date().toISOString(), public_correlation: publicCorrelation, test_script_sha256: C.createHash("sha256").update(C.fs.readFileSync(__filename)).digest("hex"), requests: [] }
  async function probe(label, route, headers, options = {}) {
    const response = await fetch("http://gateway:9000" + route, {
      method: options.method || "GET", signal: AbortSignal.timeout(30000), redirect: "error",
      headers: { referer: `http://example.test/?token=${marker}`, ...headers, ...options.headers },
      ...(options.body ? { body: options.body } : {}),
    })
    // Consume without retaining raw error content or capability URLs.
    await response.arrayBuffer()
    C.report.log_probe.requests.push({ label, status: response.status, proxy_request_id: response.headers.get("x-qa-request-id") })
    return response.status
  }
  C.check("F6 public correlation reaches backend through proxy", await probe("public-correlation", `/__qa_log_probe/${publicCorrelation}`, {}) === 404)
  const preview = await probe("preview-capability", `/store/content/preview/${marker}?guest_token=${marker}`, C.storeHeaders())
  C.check("F6 preview probe reaches handler", [400, 401, 403, 404].includes(preview))
  C.check("F6 email query probe reaches Admin", await probe("email-query", `/admin/customers?q=${encodeURIComponent(`${marker}@example.test`)}`, C.adminHeaders()) === 200)
  const invitation = await probe("invitation-query", `/admin/invites/accept?token=${marker}`, C.adminHeaders(), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
  C.check("F6 invalid invitation token reaches handler", [400, 401, 403, 404].includes(invitation))
  const guest = await probe("guest-header", "/store/texno-cart/cart_qa_log_missing", { ...C.storeHeaders(), "x-texno-cart-token": marker })
  C.check("F6 guest capability header probe refused", [400, 401, 403, 404].includes(guest))
  C.check("F6 encoded-path error probe reaches error logger", await probe("encoded-path-error", `/store/content/%70review/${marker}`, C.storeHeaders(), { method: "POST", headers: { "content-type": "application/json" }, body: "{" }) === 400)
  C.check("F6 proxy failure preserves safe diagnostics", await probe("proxy-upstream-error", `/__qa_error_probe?token=${marker}`, {}) === 502)
  C.report.log_probe.finished_at = new Date().toISOString()
  // Actual redaction is decided by verify-logs.ps1's independent log capture.
  C.report.log_probe.redaction_verification = "PENDING_INDEPENDENT_CAPTURE"
}
main().catch(error => C.blocked("F6 LOG PROBES", error.message)).finally(() => C.finish(destination))
