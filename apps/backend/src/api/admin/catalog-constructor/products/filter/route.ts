import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readConstructorProducts } from "../../../../../lib/catalog-constructor"
import type { ProductCanvasListBody } from "../../validators"

export async function POST(req: AuthenticatedMedusaRequest<ProductCanvasListBody>, res: MedusaResponse) {
  const { filters, canvas } = req.validatedBody
  res.json(await readConstructorProducts(req.scope, { ...filters, canvas }))
}
