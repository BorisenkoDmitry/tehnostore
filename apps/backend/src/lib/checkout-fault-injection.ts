import { readFile, writeFile } from "node:fs/promises"
import { MedusaError } from "@medusajs/framework/utils"

export const checkoutFaultControlPath = "/tmp/cms-remediation-checkout-fault.json"
export const checkoutFaultReachedPath = "/tmp/cms-remediation-checkout-reached.json"

export async function checkoutFaultCheckpoint(id: string, stage: string) {
  const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid").pathname.slice(1)
  if (!/^cms_remediation_(?:fixed|restored)_20261109$/.test(database)) return
  const read = async () => {
    try { return JSON.parse(await readFile(checkoutFaultControlPath, "utf8")) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error }
  }
  const control = await read()
  const envMatches = process.env.CMS_CHECKOUT_FAULT_CART_ID === id && process.env.CMS_CHECKOUT_FAULT_STAGE === stage
  if (!envMatches && (control?.cart_id !== id || control?.stage !== stage)) return
  await writeFile(checkoutFaultReachedPath, JSON.stringify({ cart_id: id, stage }))
  if (control?.action === "pause") {
    // Only an OS-local QA controller can select this. Killing/restarting the
    // isolated backend here exercises a real interruption between durable steps.
    while ((await read())?.cart_id === id) await new Promise((resolve) => setTimeout(resolve, 100))
    return
  }
  throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Controlled checkout failure: ${stage}`)
}
