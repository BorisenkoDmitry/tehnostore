import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { catalogScopes, readConstructor } from "../../../lib/catalog-constructor"
import { saveConstructorGraphWorkflow } from "../../../workflows/catalog-constructor-graph"
import type { GraphBody } from "./validators"
import { constructorProductTypes } from "../../../lib/catalog-variation-library"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { profile, menu, categories, visible } = await readConstructor(req.scope)
  const scopes = catalogScopes(profile.scope)
  res.setHeader("Cache-Control", "no-store")
  res.json({
    profile: { ...profile, product_types: constructorProductTypes(profile.product_types) },
    nodes: menu?.children ?? [],
    categories: categories.filter((row) => scopes.includes(String(row.metadata?.catalog_scope))).map((row) => ({
      ...row,
      published: row.is_active && !row.is_internal && row.metadata?.catalog_scope === profile.scope,
      public: visible.has(row.id),
    })),
  })
}

export async function POST(req: AuthenticatedMedusaRequest<GraphBody>, res: MedusaResponse) {
  const { result } = await saveConstructorGraphWorkflow(req.scope).run({ input: req.validatedBody })
  res.json(result)
}
