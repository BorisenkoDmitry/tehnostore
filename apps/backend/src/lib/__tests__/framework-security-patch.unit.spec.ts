import path from "node:path"
import fs from "node:fs"

// Require the runtime helper, not only a source copy. A missing/unapplied pinned
// patch must fail this suite before the application can be called secure.
const installed = path.join(path.dirname(require.resolve("@medusajs/framework/http")), "logging-security.js")
const { safeAccessPath, guardPublicStatic } = require(installed)

describe("F6/F7 installed framework boundary", () => {
  it("runs the exact committed helper", () => {
    const canonical = path.resolve(__dirname, "../../../../../patches/framework-logging-security.cjs")
    expect(fs.readFileSync(installed, "utf8")).toBe(fs.readFileSync(canonical, "utf8"))
  })
  it.each([
    "/store/content/preview/SYNTHETIC_PREVIEW?guest_token=SYNTHETIC_GUEST",
    "/admin/invites/accept?token=SYNTHETIC_INVITE",
    "/admin/customers?q=SYNTHETIC_EMAIL%40example.test",
    "/store/content/%70review/SYNTHETIC_PREVIEW",
  ])("redacts before access-log serialization: %s", (url) => {
    expect(safeAccessPath(url)).not.toContain("SYNTHETIC_")
  })
  it.each(["/private-export.csv", "/%70rivate-export.png", "/dir/private-export.webp", "/PRIVATE-export.png", "/file.html", "/file.svg", "/.private/file.png", "/../file.png"])("rejects static path %s before serving", (pathname) => {
    const sendStatus = jest.fn(), next = jest.fn()
    guardPublicStatic({ path: pathname }, { sendStatus }, next)
    expect(sendStatus).toHaveBeenCalledWith(404)
    expect(next).not.toHaveBeenCalled()
  })
  it("serves ordinary images with browser protections", () => {
    const setHeader = jest.fn(), next = jest.fn()
    guardPublicStatic({ path: "/product.png" }, { setHeader }, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff")
  })
})
