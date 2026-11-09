import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { catalogTrashScope, readCatalogTrashProducts, readConstructor, readConstructorProducts } from "../../../../lib/catalog-constructor"
import { changeCatalogTrashWorkflow } from "../../../../workflows/catalog-constructor-trash"
import { CatalogTrashQuerySchema, type CatalogTrashBody } from "../validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { kind, limit, offset, order = "title" } = CatalogTrashQuerySchema.parse(req.query)
  if (kind === "product") {
    const { products, count } = await readConstructorProducts(req.scope, { limit, offset, order, trash: true })
    res.json({ entries: products, count })
    return
  }
  const { categories, profile } = await readConstructor(req.scope)
  const scope = catalogTrashScope(profile.scope)
  const folders = categories
    .filter(({ metadata }) => metadata?.catalog_scope === scope)
    .map(({ id, name, handle, created_at }) => ({ id, title: name, handle, created_at, kind: "folder" as const }))
  const products = kind === "all" ? await readCatalogTrashProducts(req.scope, profile.scope) : []
  const entries = [...folders, ...products]
  const byDate = order.endsWith("created_at")
  const direction = order.startsWith("-") ? -1 : 1
  entries.sort((left, right) => {
    const value = byDate
      ? Number(new Date(left.created_at ?? 0)) - Number(new Date(right.created_at ?? 0))
      : left.title.localeCompare(right.title, "ru")
    return direction * value || left.id.localeCompare(right.id)
  })
  res.json({ entries: entries.slice(offset, offset + limit), count: entries.length })
}

export async function POST(req: AuthenticatedMedusaRequest<CatalogTrashBody>, res: MedusaResponse) {
  const { result } = await changeCatalogTrashWorkflow(req.scope).run({ input: req.validatedBody })
  res.json(result)
}
