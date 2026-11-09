import { redactLogText } from "../log-redaction"

describe("F6 log redaction", () => {
  it.each([
    ["GET /store/content/preview/SYNTHETIC_PREVIEW_SECRET?x=1", "SYNTHETIC_PREVIEW_SECRET"],
    ["Error 400 at /store/content/%70review/SYNTHETIC_ENCODED_SECRET", "SYNTHETIC_ENCODED_SECRET"],
    ["/admin/invites/accept?token=prefix%20SYNTHETIC_QUERY_SUFFIX", "SYNTHETIC_QUERY_SUFFIX"],
    ["/admin/invites/accept?token=SYNTHETIC_INVITE_SECRET", "SYNTHETIC_INVITE_SECRET"],
    ["/admin/customers?q=synthetic%40example.test", "synthetic"],
    ["customer synthetic@example.test", "synthetic@example.test"],
    ["customer synthetic%40example.test", "synthetic"],
    ["guest_token: SYNTHETIC_GUEST_SECRET", "SYNTHETIC_GUEST_SECRET"],
    ["Authorization: Bearer SYNTHETIC_BEARER_SECRET", "SYNTHETIC_BEARER_SECRET"],
  ])("removes a synthetic marker before logging: %s", (input, secret) => {
    expect(redactLogText(input)).not.toContain(secret)
  })
  it("keeps safe diagnostics", () => {
    expect(redactLogText("POST /admin/products status=400 validation failed")).toBe("POST /admin/products status=400 validation failed")
  })
})
