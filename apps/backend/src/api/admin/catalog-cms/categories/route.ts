import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CatalogCategoryBody } from "../validators"
import { saveCatalogCategoryWorkflow } from "../../../../workflows/catalog-cms"
import { getCatalogProfile } from "../../../../lib/catalog-cms"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_category", fields: ["id", "name", "handle", "parent_category_id", "is_active", "is_internal", "metadata", "created_at"], pagination: { take: 1000 } })
  const profile = await getCatalogProfile(req.scope)
  res.json({ categories: data, scope: profile.scope, product_types: profile.product_types })
}

export async function POST(req: AuthenticatedMedusaRequest<CatalogCategoryBody>, res: MedusaResponse) {
  const { result } = await saveCatalogCategoryWorkflow(req.scope).run({ input: { data: req.validatedBody, actor_id: req.auth_context.actor_id } })
  res.json(result)
}
