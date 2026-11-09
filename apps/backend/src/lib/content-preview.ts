import { createHmac, timingSafeEqual } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"

const secret = () => {
  const value = process.env.JWT_SECRET
  if (!value) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "CMS preview secret is not configured")
  return value
}
export function createContentPreviewToken(id: string, revision: number) {
  const payload = Buffer.from(JSON.stringify({ id, revision, exp: Date.now() + 15 * 60 * 1000 })).toString("base64url")
  const signature = createHmac("sha256", secret()).update(`content-preview:${payload}`).digest("base64url")
  return `${payload}.${signature}`
}
export function readContentPreviewToken(token: string): { id: string; revision: number } {
  const reject = () => { throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Ссылка предпросмотра недействительна или устарела") }
  if (token.length > 1500) return reject()
  const [payload, signature, extra] = token.split(".")
  if (!payload || !signature || extra) return reject()
  const expected = createHmac("sha256", secret()).update(`content-preview:${payload}`).digest()
  const received = Buffer.from(signature, "base64url")
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return reject()
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    if (typeof value.id !== "string" || !Number.isInteger(value.revision) || typeof value.exp !== "number" || value.exp < Date.now()) return reject()
    return { id: value.id, revision: value.revision }
  } catch { return reject() }
}
