import type { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import { checkoutRegion, regionConfiguration } from "../../../../lib/texno-cart"
export async function GET(req: MedusaStoreRequest, res: MedusaResponse) { res.json({ configuration: regionConfiguration(await checkoutRegion(req.scope)) }) }
