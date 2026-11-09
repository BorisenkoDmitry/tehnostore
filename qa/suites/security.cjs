const { randomUUID } = require("node:crypto")
const path = require("node:path")

// All writes use the preflight-verified runner context. Returned capabilities,
// cookies, credentials and private URLs are deliberately never added to proof.
module.exports = async function security(C) {
  await C.runCase("F5 staff bearer/session revocation", async () => {
    const email = `remediation-${C.runId}-${randomUUID().slice(0, 6)}@example.test`
    const password = `${randomUUID()}Aa1!`
    const invite = C.ok(await C.ar("/invites", "POST", { email })).invite
    C.track("invite", invite.id)
    const identity = C.ok(await C.auth("/user/emailpass/register", { email, password }))
    const accepted = C.ok(await C.request(`/admin/invites/accept?token=${encodeURIComponent(invite.token)}`, "POST", { email, first_name: "Synthetic", last_name: "Staff" }, { authorization: `Bearer ${identity.token}` }, "raw"))
    const user = accepted.user
    C.track("user", user.id)
    const login = C.ok(await C.auth("/user/emailpass", { email, password }))
    const staff = { authorization: `Bearer ${login.token}` }
    C.check("F5 active bearer native", (await C.request("/admin/products?limit=1", "GET", undefined, staff, "raw")).status === 200)
    C.check("F5 active bearer custom", (await C.request("/admin/content/pages?limit=1", "GET", undefined, staff, "raw")).status === 200)
    const session = await C.request("/auth/session", "POST", undefined, staff, "raw")
    C.check("F5 session issued", session.status === 200)
    const cookies = session.headers.getSetCookie ? session.headers.getSetCookie() : [session.headers.get("set-cookie")].filter(Boolean)
    const cookie = cookies.map((value) => value.split(";", 1)[0]).join("; ")
    C.check("F5 session cookie exists", !!cookie)
    C.check("F5 active session", (await C.request("/admin/products?limit=1", "GET", undefined, { cookie }, "raw")).status === 200)
    C.ok(await C.ar(`/users/${user.id}`, "DELETE"))
    for (const path of ["/admin/products?limit=1", "/admin/content/pages?limit=1", "/admin/users/me"]) {
      C.check(`F5 deleted bearer denied ${path.split("?")[0]}`, (await C.request(path, "GET", undefined, staff, "raw")).status === 401)
      C.check(`F5 deleted session denied ${path.split("?")[0]}`, (await C.request(path, "GET", undefined, { cookie }, "raw")).status === 401)
    }
    C.check("F5 existing administrator remains active", (await C.ar("/users/me")).status === 200)
  })

  await C.runCase("F7 uploads stay private and public images work", async () => {
    const upload = async (filename, type, content) => {
      const form = new FormData()
      form.append("files", new Blob([content], { type }), filename)
      const response = await C.request("/admin/uploads", "POST", form, C.adminHeaders(), "raw")
      const file = C.ok(response).files[0]
      C.track("file", file.id)
      return file
    }
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64")
    const image = await upload(`synthetic-${C.runId}.png`, "image/png", png)
    C.check("F7 raster image public", (await C.request(new URL(image.url).pathname, "GET", undefined, {}, "raw")).status === 200)
    for (const [extension, mime, content] of [["html", "text/html", "<!doctype html><title>Synthetic inert probe</title>"], ["csv", "text/csv", "SKU,PRICE\nSYNTHETIC,10"]]) {
      const file = await upload(`synthetic-${C.runId}.${extension}`, mime, content)
      const url = new URL(file.url)
      const download = url.pathname + url.search
      C.check(`F7 ${extension} anonymous denied`, (await C.request(download, "GET", undefined, {}, "raw")).status === 401)
      const staff = await C.request(download, "GET", undefined, C.adminHeaders(), "raw")
      C.check(`F7 ${extension} staff download`, staff.status === 200)
      C.check(`F7 ${extension} attachment`, staff.headers.get("content-disposition")?.includes("attachment") === true)
      C.check(`F7 ${extension} nosniff`, staff.headers.get("x-content-type-options") === "nosniff")
      C.check(`F7 ${extension} no shared cache`, staff.headers.get("cache-control")?.includes("no-store") === true)
      const key = url.searchParams.get("key")
      C.check(`F7 ${extension} static key denied`, (await C.request(`/static/${encodeURIComponent(key)}`, "GET", undefined, {}, "raw")).status === 404)
    }
    // Create exact filesystem probes to model files that were already public
    // before the fix. A 404 for a nonexistent old filename proves nothing.
    const probes = [`private-${C.runId}-legacy.csv`, `${C.runId}-legacy.html`, `${C.runId}-legacy.svg`]
    for (const filename of probes) {
      const target = path.join(C.root, "apps/backend/static", filename)
      await C.fs.promises.writeFile(target, "SYNTHETIC LEGACY FILE", { flag: "wx" })
      C.track("filesystem_probe", filename)
      try {
        C.check("F7 existing legacy/static active file denied", (await C.request(`/static/${filename}`, "GET", undefined, {}, "raw")).status === 404)
        if (filename.startsWith("private-")) {
          C.check("F7 encoded existing private file denied", (await C.request(`/static/%70${filename.slice(1)}`, "GET", undefined, {}, "raw")).status === 404)
          C.check("F7 legacy file staff download", (await C.request(`/admin/private-files?key=${encodeURIComponent(filename)}`, "GET", undefined, C.adminHeaders(), "raw")).status === 200)
        }
      } finally { await C.fs.promises.unlink(target) }
    }
    C.check("F7 private traversal denied", (await C.request("/admin/private-files?key=..%2Fprivate-secret.csv", "GET", undefined, C.adminHeaders(), "raw")).status === 400)
  })

  await C.runCase("F6 exact synthetic log probes", async () => {
    const marker = `SYNTHETIC_SECRET_${C.runId.replace(/[^a-z0-9]/gi, "")}`
    // Root runner inspects backend/proxy logs for these exact values after
    // this suite. An HTTP response alone does not prove log redaction.
    C.logMarkers ||= []
    C.logMarkers.push(marker, `${marker}@example.test`)
    await C.request(`/store/content/preview/${marker}?guest_token=${marker}`, "GET", undefined, { referer: `http://example.test/?token=${marker}` }, "store")
    await C.ar(`/customers?q=${encodeURIComponent(`${marker}@example.test`)}`)
    await C.request(`/admin/invites/accept?token=${marker}`, "POST", {}, C.adminHeaders(), "raw")
    if (typeof C.verifyLogs !== "function") {
      C.blocked("F6 backend/proxy/error-log inspection", "Exact synthetic probes were sent, but independent runtime log capture is unavailable. HTTP responses do not verify redaction.")
    } else {
      const proof = await C.verifyLogs(C.logMarkers)
      for (const surface of ["backend", "proxy", "error"]) {
        const result = proof?.[surface]
        C.check(`F6 ${surface} logs exclude exact synthetic markers`, result?.captured === true && result?.marker_matches === 0, { surface, captured: result?.captured === true, marker_matches: result?.marker_matches })
      }
    }
  })
}
