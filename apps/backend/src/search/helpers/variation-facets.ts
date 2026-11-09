import { canonicalCatalogToken } from "./catalog-filter-values"
import { catalogAliasFilterValues, catalogFacetValues, legacyCatalogHierarchyValues } from "./catalog-facet-values"
import { libraryChoiceChanged, libraryChoices } from "../../lib/catalog-variation-library"

export const LEGACY_VARIATION_FACETS = "catalog_legacy_variation_facets"

type Metadata = Record<string, unknown> | null | undefined
type VariationAttribute = {
  key?: string
  label: string
  public?: boolean
  legacyLabels?: string[]
  values: { value: string }[]
}
export type FacetVariant = {
  id?: string
  metadata?: Metadata
  options?: { value: string; option?: { title: string } | null }[] | null
  catalog_variant?: { attributes?: VariationAttribute[] } | null
}
type FacetSnapshot = { display: string[]; lookup: string[] }
type FacetDefinition = { code: string; label: string; aliases?: unknown }
type LegacyProduct = Parameters<typeof catalogFacetValues>[0]

const split = (entry: string) => {
  const colon = entry.indexOf(":")
  return { label: entry.slice(0, colon), value: entry.slice(colon + 1) }
}
const group = (label: string) => {
  const key = canonicalCatalogToken(label)
  return key === "цвет варианта" ? "цвет" : key
}
const unique = (values: string[]) => [...new Map(values.map((value) => [canonicalCatalogToken(value), value])).values()]

export function legacyVariationFacets(metadata: Metadata): FacetSnapshot {
  const value = metadata?.[LEGACY_VARIATION_FACETS] as Partial<FacetSnapshot> | undefined
  const strings = (entries: unknown) => Array.isArray(entries) ? entries.filter((entry): entry is string => typeof entry === "string" && entry.indexOf(":") > 0) : []
  return { display: strings(value?.display), lookup: strings(value?.lookup) }
}

/** Conversion at the import boundary. Existing product-level facts are copied
 * once, and an axis already distinguished by real variants stays per variant. */
export function snapshotLegacyVariations(product: LegacyProduct, variants: FacetVariant[]): FacetSnapshot[] {
  const display = catalogFacetValues(product)
  const lookup = [...legacyCatalogHierarchyValues(product), ...catalogAliasFilterValues(product)]
  const facts = variants.map((variant) => {
    const fields = new Map<string, Set<string>>()
    const add = (label: string, value: string) => {
      const key = group(label)
      const values = fields.get(key) ?? new Set<string>()
      values.add(canonicalCatalogToken(value))
      fields.set(key, values)
    }
    for (const option of variant.options ?? []) if (option.option) add(option.option.title, option.value)
    for (const attr of variant.catalog_variant?.attributes ?? []) {
      if (attr.public === false) continue
      for (const label of [attr.label, ...(attr.legacyLabels ?? [])]) for (const item of attr.values) add(label, item.value)
    }
    return fields
  })
  return facts.map((current) => {
    const belongs = (entry: string) => {
      const { label, value } = split(entry)
      const key = group(label)
      const token = canonicalCatalogToken(value)
      return current.get(key)?.has(token) || !facts.some((other) => other.get(key)?.has(token))
    }
    return { display: display.filter(belongs), lookup: lookup.filter(belongs) }
  })
}

export function libraryFacetNames(definitions: FacetDefinition[]) {
  return new Map(definitions.map(({ code, label, aliases }) => [code, [label, ...(Array.isArray(aliases) ? aliases.filter((name): name is string => typeof name === "string") : [])]]))
}

export function variationFacets(variant: FacetVariant, metadata?: Metadata, names?: ReturnType<typeof libraryFacetNames>): FacetSnapshot {
  const configured = metadata?.catalog_constructor_axes as Record<string, string> | undefined
  const imported = !!metadata?.insales_product_id
  const legacy = legacyVariationFacets(variant.metadata)
  const choices = Object.entries(libraryChoices(metadata, variant.id))
  const added = choices.flatMap(([, assignment]) => libraryChoiceChanged(assignment) && !assignment.display?.length && assignment.label ? [`${assignment.label}:${assignment.value}`] : [])
  const assignmentEntries = (key: "display" | "lookup") => choices.flatMap(([code, assignment]) => {
    const entries = assignment[key] ?? []
    return entries.map((entry) => ({ code, source: entry, value: libraryChoiceChanged(assignment) ? `${split(entry).label}:${assignment.value}` : entry }))
  })
  const displayBindings = assignmentEntries("display")
  const lookupBindings = assignmentEntries("lookup")
  const remap = (entries: string[], bindings: typeof displayBindings) => {
    const exact = new Map(bindings.map((binding) => [binding.source, binding.value]))
    const boundGroups = new Set(bindings.map(({ source }) => group(split(source).label)))
    // Source refreshes can change a snapshot; current library assignments own
    // their bound groups. Keep unrelated hierarchy lookups and source order.
    const ordered = entries.flatMap((entry) => exact.has(entry) ? [exact.get(entry)!] : boundGroups.has(group(split(entry).label)) ? [] : [entry])
    return [...ordered, ...bindings.filter((binding) => !entries.includes(binding.source)).map(({ value }) => value)]
  }
  const display: string[] = []
  const lookup: string[] = []
  const replacedGroups = new Set<string>()
  for (const [code, title] of Object.entries(configured ?? {})) {
    const attribute = variant.catalog_variant?.attributes?.find((entry) => entry.key === code)
    const labels = [attribute?.label ?? title, ...(attribute?.legacyLabels ?? []), title]
    for (const label of labels) replacedGroups.add(group(label))
    if (attribute?.public === false) continue
    const value = attribute?.values[0]?.value ?? variant.options?.find((option) => option.option?.title === title)?.value
    if (value) {
      display.push(`${labels[0]}:${value}`)
      lookup.push(...labels.slice(1).map((label) => `${label}:${value}`))
    }
  }
  // Older native records can carry actual choice values with no CMS mapping.
  // Imported option names keep their existing visibility from the snapshot.
  if (!configured && !imported) {
    for (const option of variant.options ?? []) if (option.option) display.push(`${option.option.title}:${option.value}`)
  }
  const unreplaced = (entry: string) => !replacedGroups.has(group(split(entry).label))
  const actualDisplay = unique([...remap(legacy.display, displayBindings).filter(unreplaced), ...display, ...added])
  const actualLookup = unique([...remap(legacy.lookup, lookupBindings).filter(unreplaced), ...lookup])
  const existingTokens = new Set([...actualDisplay, ...actualLookup].map(canonicalCatalogToken))
  for (const [code, assignment] of choices) {
    const [currentLabel, ...previousLabels] = names?.get(code) ?? []
    if (!currentLabel || !previousLabels.length) continue
    const previous = new Set(previousLabels.map(canonicalCatalogToken))
    const bound = displayBindings.filter((binding) => binding.code === code && unreplaced(binding.value)).map(({ value }) => split(value))
    const fields = bound.length ? bound : assignment.label && libraryChoiceChanged(assignment) ? [{ label: assignment.label, value: assignment.value }] : []
    if (!fields.some(({ label }) => previous.has(canonicalCatalogToken(label)) && canonicalCatalogToken(label) !== canonicalCatalogToken(currentLabel))) continue
    for (const name of [currentLabel, ...previousLabels]) for (const { value } of fields) {
      const entry = `${name}:${value}`
      const token = canonicalCatalogToken(entry)
      if (!existingTokens.has(token)) {
        actualLookup.push(entry)
        existingTokens.add(token)
      }
    }
  }
  return {
    display: actualDisplay,
    lookup: actualLookup,
  }
}

