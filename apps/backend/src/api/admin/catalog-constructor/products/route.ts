import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { readConstructorProducts } from "../../../../lib/catalog-constructor"
import { saveConstructorProductWorkflow } from "../../../../workflows/catalog-constructor-product"
import { ProductListSchema, type ConstructorProductBody } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const filters = ProductListSchema.parse(req.query)
  res.json(await readConstructorProducts(req.scope, filters))
}

export async function POST(req: AuthenticatedMedusaRequest<ConstructorProductBody>, res: MedusaResponse) {
  const { result } = await saveConstructorProductWorkflow(req.scope).run({
    input: { data: req.validatedBody, actor_id: req.auth_context.actor_id },
  })
  res.json(result)
}
