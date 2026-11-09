import type { CatalogDefinitionData } from "./catalog-cms"
import type { CatalogAttributeInput, CatalogProductType } from "../modules/catalog-attributes/types"

export const LIBRARY_VARIATIONS = "catalog_library_variations"
export const LIBRARY_COLOR = "attr_2ff8d5ba2918"
export const LEGACY_COLOR = "variant_color"
export const LIBRARY_RAM = "variant_ram"
export const RAM_SPECIFICATION = "attr_4a554d5e0bcf"
export const DETACHED_VARIATION_FIELDS = "catalog_detached_variation_fields"

type Metadata = Record<string, unknown> | null | undefined
export type LibraryChoice = {
  choice: string
  value: string
  label?: string
  original?: string
  source_keys?: string[]
  display?: string[]
  lookup?: string[]
}
export type LibraryChoices = Record<string, LibraryChoice>
export type LibraryVariations = Record<string, LibraryChoices>

export function detachedVariationFields(metadata: Metadata) {
  const codes = metadata?.[DETACHED_VARIATION_FIELDS]
  return new Set(Array.isArray(codes) ? codes.filter((code): code is string => typeof code === "string") : [])
}

export function ramAmount(value: string) {
  const match = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:гб|gb)?$/iu)
  const amount = match ? Number(match[1].replace(",", ".")) : 0
  return Number.isFinite(amount) && amount > 0 ? String(amount) : null
}

export function isRamAttribute({ key, label }: Pick<CatalogAttributeInput, "key" | "label">) {
  return key === LIBRARY_RAM || key === RAM_SPECIFICATION ||
    /^(?:(?:объ[её]м\s+)?оперативн(?:ая|ой)\s+памят(?:ь|и)|озу|ram)$/iu.test(label.trim())
}

export function ramLibraryChoice(...sources: (CatalogAttributeInput[] | undefined)[]): LibraryChoice | undefined {
  for (const source of sources) {
    const attributes = source?.filter((attribute) => attribute.public && isRamAttribute(attribute)) ?? []
    if (!attributes.length) continue
    const amounts = new Set(attributes.flatMap(({ values }) => values.map(({ value }) => ramAmount(value))))
    const [choice] = amounts
    return amounts.size === 1 && choice ? { choice, original: choice, value: `${choice} ГБ` } : undefined
  }
}

export function libraryVariations(metadata: Metadata) {
  return metadata?.[LIBRARY_VARIATIONS] as LibraryVariations | undefined
}

export function libraryChoices(metadata: Metadata, id: string | undefined) {
  return id ? libraryVariations(metadata)?.[id] ?? {} : {}
}

export function attachRamChoices(metadata: Metadata, attributes: CatalogAttributeInput[] | undefined, variants: { id: string; attributes?: CatalogAttributeInput[] }[]) {
  if (detachedVariationFields(metadata).has(LIBRARY_RAM)) return
  const existing = libraryVariations(metadata) ?? {}
  const additions = variants.flatMap(({ id, attributes: facts }) => {
    const current = existing[id]?.[LIBRARY_RAM]
    if (current && libraryChoiceChanged(current)) return []
    const ram = ramLibraryChoice(facts, attributes)
    return ram && ram.choice !== current?.choice ? [[id, { ...existing[id], [LIBRARY_RAM]: ram }] as const] : []
  })
  return additions.length ? { ...existing, ...Object.fromEntries(additions) } : undefined
}

export function librarySourceKeys(metadata: Metadata) {
  return new Set(Object.values(libraryVariations(metadata) ?? {}).flatMap((row) => Object.values(row).flatMap((assignment) => assignment.source_keys ?? [])))
}

export function canonicalLibraryCode(code: string) {
  return code === LEGACY_COLOR ? LIBRARY_COLOR : code
}

export function constructorProductTypes(types: CatalogProductType[]): CatalogProductType[] {
  return types.map((type) => ({ ...type, variant_axes: [...new Set(type.variant_axes.map(canonicalLibraryCode))] }))
}

export function isLibraryDefinition(definition: CatalogDefinitionData) {
  return definition.code !== LEGACY_COLOR && (definition.role === "color" || definition.role === "variant_axis" || !!definition.choice_values?.length)
}

export function libraryChoiceChanged(choice: LibraryChoice) {
  return choice.choice !== choice.original
}

export function librarySpecificationValues(attributes: CatalogAttributeInput[] | undefined, choices: LibraryChoices) {
  const overrides = Object.values(choices).filter(libraryChoiceChanged)
  return (attributes ?? []).map((attribute) => {
    const assignment = overrides.find((entry) => entry.source_keys?.includes(attribute.key))
    if (!assignment) return attribute
    return { ...attribute, rawValues: [assignment.value], values: [{ ...attribute.values[0], value: assignment.value }] }
  })
}
