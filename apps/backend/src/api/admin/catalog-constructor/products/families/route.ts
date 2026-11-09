import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readConstructorFamilies } from "../../../../../lib/catalog-constructor"
import { FamilyListSchema } from "../../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { category_id } = FamilyListSchema.parse(req.query)
  res.json({ families: await readConstructorFamilies(req.scope, category_id ? [category_id] : undefined) })
}
