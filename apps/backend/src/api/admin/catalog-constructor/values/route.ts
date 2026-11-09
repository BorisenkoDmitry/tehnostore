import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { CATALOG_ATTRIBUTES_MODULE } from "../../../../modules/catalog-attributes"
import CatalogAttributesModuleService from "../../../../modules/catalog-attributes/service"
import { canonicalCatalogToken } from "../../../../search/helpers/catalog-filter-values"
import { canonicalLibraryCode, isLibraryDefinition } from "../../../../lib/catalog-variation-library"

const ValueQuery = z.object({ code: z.string().min(1).max(100), q: z.string().max(150).optional() })

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const { code, q } = ValueQuery.parse(req.query)
  const service = req.scope.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const values = new Map<string, string>()
  const [definition] = await service.listCatalogDefinitions({ code: canonicalLibraryCode(code), enabled: true }, { take: 1 })
  const needle = canonicalCatalogToken(q ?? "")
  for (const value of definition?.choice_values ?? []) {
    const token = canonicalCatalogToken(value)
    if (token.includes(needle)) values.set(token, value)
    if (values.size >= 30) break
  }
  if (definition && isLibraryDefinition(definition)) {
    res.json({ values: [...values.values()].sort((left, right) => left.localeCompare(right, "ru", { numeric: true })) })
    return
  }
  const take = 250
  for (let skip = 0; values.size < 30; skip += take) {
    const rows = await service.listCatalogAttributes({ key: code, ...(q ? { normalized_value: { $ilike: `%${canonicalCatalogToken(q)}%` } } : {}) }, {
      select: ["value", "numeric_value"], take, skip, order: { id: "ASC" },
    })
    for (const row of rows) {
      const value = row.numeric_value === null || row.numeric_value === undefined ? row.value : String(row.numeric_value)
      const token = canonicalCatalogToken(value)
      if (!values.has(token)) values.set(token, value)
      if (values.size === 30) break
    }
    if (rows.length < take) break
  }
  res.json({ values: [...values.values()].sort((left, right) => left.localeCompare(right, "ru", { numeric: true })) })
}
