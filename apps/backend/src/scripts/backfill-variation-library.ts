import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateProductsStep } from "@medusajs/medusa/core-flows"
import { getCatalogProfile, type CatalogDefinitionData } from "../lib/catalog-cms"
import { CATALOG_STRUCTURE_LOCK, catalogScopes, invalidCatalog } from "../lib/catalog-constructor"
import { canonicalLibraryCode, detachedVariationFields, LIBRARY_COLOR, LIBRARY_RAM, LIBRARY_VARIATIONS, libraryVariations, type LibraryChoice, type LibraryVariations } from "../lib/catalog-variation-library"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"
import { canonicalCatalogToken } from "../search/helpers/catalog-filter-values"
import { LEGACY_VARIATION_FACETS, legacyVariationFacets, libraryFacetNames, variationFacets, type FacetVariant } from "../search/helpers/variation-facets"

type Source = { key: string; label: string; values: { value: string }[]; legacyLabels?: string[]; public?: boolean }
type Variant = FacetVariant & { id: string; catalog_variant?: { attributes?: CatalogAttributeInput[] } | null }
type Product = {
  id: string
  metadata: Record<string, unknown>
  catalog_record?: { attributes?: CatalogAttributeInput[] } | null
  variants: Variant[]
}

// The preflight proves the indexed fields are unchanged. Run the native
// metadata update step without the full workflow's product.updated event.
const transferVariationLibraryWorkflow = createWorkflow("transfer-variation-library", function (input: {
  products: { id: string; metadata: Record<string, unknown> }[]
}) {
  return new WorkflowResponse(updateProductsStep(input))
})

const legacyFacetCodes = new Map([
  ["цвет", LIBRARY_COLOR],
  ["цвет варианта", LIBRARY_COLOR],
  ["встроенная память", "attr_2a58b4f111ea"],
  ["объем встроенной памяти", "attr_2a58b4f111ea"],
  ["диагональ", "attr_b918c7921a5e"],
  ["количество ядер процессора", "attr_df26110faa1f"],
  ["сканер отпечатка пальца", "attr_2dda931459c4"],
])

function facetField(entry: string) {
  return entry.slice(0, entry.indexOf(":"))
}

function planVariations(product: Product, definitions: CatalogDefinitionData[]): LibraryVariations {
  const labelCode = (label: string) => {
    const key = canonicalCatalogToken(label)
    return legacyFacetCodes.get(key) ?? definitions.find((definition) =>
      [definition.label, ...(definition.aliases ?? [])].some((name) => canonicalCatalogToken(name) === key)
    )?.code
  }
  return Object.fromEntries(product.variants.map((variant) => {
    const legacy = legacyVariationFacets(variant.metadata)
    const configuration = (variant.metadata?.[LEGACY_VARIATION_FACETS] as { configuration?: Source[] } | undefined)?.configuration ?? []
    const sources: Source[] = [
      ...(variant.catalog_variant?.attributes ?? []),
      ...(variant.options ?? []).flatMap((option) => {
        const label = option.option?.title
        const code = label && labelCode(label)
        return code && label ? [{ key: code, label, values: [{ value: option.value }], public: true }] : []
      }),
      ...configuration,
      ...(product.catalog_record?.attributes ?? []),
    ].filter((source) => source.public !== false)
    const sourceCode = (source: Source) => canonicalLibraryCode(definitions.some((definition) => definition.code === source.key) ? source.key : labelCode(source.label) ?? source.key)
    const byCode = new Map<string, LibraryChoice>()
    const values = new Map<string, Set<string>>()
    for (const entry of legacy.display) {
      const label = facetField(entry)
      const code = labelCode(label)
      const matched = code && sources.filter((source) => sourceCode(source) === code).flatMap((source) => source.values.map(({ value }) => value))
        .find((value) => canonicalCatalogToken(`${label}:${value}`) === canonicalCatalogToken(entry))
      if (!code || !matched || !definitions.some((definition) => definition.code === code && definition.enabled)) {
        throw invalidCatalog(`Не найден структурированный источник фильтра ${JSON.stringify(entry)} у ${product.id}/${variant.id}`)
      }
      const fieldValues = values.get(code) ?? new Set<string>()
      fieldValues.add(matched)
      values.set(code, fieldValues)
      const binding = byCode.get(code) ?? { choice: "", value: "", display: [] }
      binding.display!.push(entry)
      byCode.set(code, binding)
    }
    for (const source of configuration) {
      const code = sourceCode(source)
      if (values.has(code) || source.values.length !== 1 || !definitions.some((definition) => definition.code === code && definition.enabled)) continue
      const selected = sources.find((entry) => sourceCode(entry) === code && entry.values.length === 1) ?? source
      values.set(code, new Set(selected.values.map(({ value }) => value)))
      byCode.set(code, { choice: "", value: "" })
    }
    for (const [code, binding] of byCode) {
      const selected = [...values.get(code)!]
      binding.choice = binding.original = binding.value = selected.join(" / ")
      binding.source_keys = [...new Set(sources.filter((source) => sourceCode(source) === code).map((source) => source.key))]
      const aliases = legacy.lookup.filter((entry) => labelCode(facetField(entry)) === code && selected.some((value) => canonicalCatalogToken(`${facetField(entry)}:${value}`) === canonicalCatalogToken(entry)))
      if (aliases.length) binding.lookup = aliases
    }
    return [variant.id, Object.fromEntries(byCode)]
  }))
}

export default async function backfillVariationLibrary({ container }: ExecArgs) {
  const database = new URL(process.env.DATABASE_URL!)
  const apply = process.env.CATALOG_VARIATIONS_APPLY === "1"
  const connection = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  const { rows: [{ name }] } = await connection.raw<{ rows: { name: string }[] }>("select current_database() as name")
  if (database.pathname.slice(1) !== name || (apply && (!["postgres", "localhost", "127.0.0.1"].includes(database.hostname) || name !== process.env.CATALOG_VARIATIONS_DATABASE))) {
    throw invalidCatalog("Укажите точное имя фактической локальной базы для переноса значений")
  }
  const migrate = async () => {
    const profile = await getCatalogProfile(container)
    const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
    const definitions = await service.listCatalogDefinitions({}, { take: 1000 }) as CatalogDefinitionData[]
    const names = libraryFacetNames(definitions)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const updates: { id: string; before: Product["metadata"]; metadata: Product["metadata"] }[] = []
    const values = new Map<string, Set<string>>()
    const scopes = catalogScopes(profile.scope)
    let products = 0
    let variants = 0
    let assignments = 0
    const take = 200
    for (let skip = 0; ; skip += take) {
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "metadata", "catalog_record.attributes", "variants.id", "variants.metadata",
          "variants.options.option.title", "variants.options.value", "variants.catalog_variant.attributes"],
        pagination: { skip, take, order: { id: "ASC" } },
      })
      for (const product of data as unknown as Product[]) {
        if (!product.metadata?.insales_product_id || !scopes.includes(String(product.metadata.catalog_scope))) continue
        products++
        variants += product.variants.length
        const previous = libraryVariations(product.metadata)
        if (previous && Object.values(previous).some((row) => Object.keys(row).some((code) => code !== LIBRARY_RAM))) continue
        if (product.variants.some((variant) => !variant.metadata?.[LEGACY_VARIATION_FACETS])) {
          throw invalidCatalog(`Сначала создайте снимок прежних фасетов для ${product.id}`)
        }
        const detached = detachedVariationFields(product.metadata)
        const planned = Object.fromEntries(Object.entries(planVariations(product, definitions)).map(([id, choices]) => [
          id, Object.fromEntries(Object.entries({ ...choices, ...previous?.[id] }).filter(([code]) => !detached.has(code))),
        ])) as LibraryVariations
        if (JSON.stringify(planned) === JSON.stringify(previous)) continue
        const metadata = { ...product.metadata, [LIBRARY_VARIATIONS]: planned }
        for (const variant of product.variants) {
          if (JSON.stringify(variationFacets(variant, metadata, names)) !== JSON.stringify(variationFacets(variant, product.metadata, names))) {
            throw invalidCatalog(`Перенос меняет фасеты ${product.id}/${variant.id}`)
          }
          for (const [code, binding] of Object.entries(planned[variant.id])) {
            const choices = values.get(code) ?? new Set<string>()
            choices.add(binding.choice)
            values.set(code, choices)
            assignments++
          }
        }
        updates.push({ id: product.id, before: product.metadata, metadata })
      }
      if (data.length < take) break
    }
    const changedDefinitions = definitions.flatMap((definition) => {
      const before = definition.choice_values ?? []
      const additional = [...(values.get(definition.code) ?? [])].filter((value) => !before.includes(value)).sort((a, b) => a.localeCompare(b, "ru", { numeric: true }))
      return additional.length ? [{ id: definition.id, code: definition.code, before, choice_values: [...before, ...additional] }] : []
    })
    if (apply) {
      const applied: typeof updates = []
      let definitionsApplied = false
      try {
        if (changedDefinitions.length) {
          await service.updateCatalogDefinitions(changedDefinitions.map(({ id, choice_values }) => ({ id, choice_values })))
          definitionsApplied = true
        }
        for (let index = 0; index < updates.length; index += 100) {
          const batch = updates.slice(index, index + 100)
          await transferVariationLibraryWorkflow(container).run({ input: { products: batch.map(({ id, metadata }) => ({ id, metadata })) } })
          applied.push(...batch)
        }
      } catch (error) {
        for (let index = 0; index < applied.length; index += 100) {
          await transferVariationLibraryWorkflow(container).run({ input: { products: applied.slice(index, index + 100).map(({ id, before }) => ({ id, metadata: { ...before, [LIBRARY_VARIATIONS]: before[LIBRARY_VARIATIONS] ?? null } })) } })
        }
        if (definitionsApplied) await service.updateCatalogDefinitions(changedDefinitions.map(({ id, before }) => ({ id, choice_values: before })))
        throw error
      }
    }
    console.log(JSON.stringify({ database: name, apply, products, variants, assignments, updated: apply ? updates.length : 0, pending: apply ? 0 : updates.length,
      definitions: Object.fromEntries(changedDefinitions.map(({ code, choice_values }) => [code, choice_values.length])) }))
  }
  if (apply) await container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, migrate, { timeout: 10, expire: 900 })
  else await migrate()
}
