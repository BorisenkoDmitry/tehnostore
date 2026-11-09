import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { access, lstat } from "node:fs/promises"
import path from "node:path"
import { resolvePrivateFilePath } from "../../../modules/secure-local-file/service"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const key = req.query.key
  if (typeof key !== "string") throw new MedusaError(MedusaError.Types.INVALID_DATA, "File key required")
  let filePath = resolvePrivateFilePath(key)
  try {
    await access(filePath)
  } catch {
    // Legacy exports remain protected at their old URL by the early static
    // guard. Staff can download them here without rewriting historical data.
    filePath = resolvePrivateFilePath(key, path.join(process.cwd(), "static"))
  }
  try {
    const stat = await lstat(filePath)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not a regular file")
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "File not found")
  }
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'")
  res.attachment(path.basename(key))
  res.type("application/octet-stream")
  res.sendFile(filePath)
}
