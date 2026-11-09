import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"
import { catalogBrand, catalogKind, catalogStableId, CatalogDefinitionData } from "./catalog-cms"
import { LEGACY_VARIATION_FACETS } from "../search/helpers/variation-facets"
import { canonicalLibraryCode, detachedVariationFields, isRamAttribute, LIBRARY_COLOR, LIBRARY_RAM, libraryChoiceChanged, libraryChoices, ramAmount, ramLibraryChoice } from "./catalog-variation-library"

export type ConfigurationProduct = {
  id: string
  handle: string
  title: string
  metadata?: Record<string, unknown>
  categories?: { id: string; handle: string; parent_category_id?: string | null; is_active?: boolean; is_internal?: boolean; metadata?: Record<string, unknown> | null }[]
  catalog_record?: { attributes?: CatalogAttributeInput[] } | null
  variants?: { id: string; title: string; metadata?: Record<string, unknown>; catalog_variant?: { attributes?: CatalogAttributeInput[] } | null }[]
}

export type ProductConfiguration = {
  product_id: string
  variant_id: string
  handle: string
  color: string | null
  storage: string | null
  ram?: string | null
  axes?: Record<string, string | null>
}

export const namedFamilyPrefix = "named-family:"
export const isInferredFamilyId = (id: unknown): id is string => typeof id === "string" && /^family-auto_[a-f0-9]{32}$/.test(id)
export const isNamedFamilyId = (id: unknown): id is string => typeof id === "string" && id.startsWith(namedFamilyPrefix)

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/ё/g, "е").replace(/[–—‑]/g, "-").replace(/\s+/g, " ").trim()
const colorAttribute = (label: string) => /^цвет(?:\s+.+)?$/.test(normalize(label))
const storageAttribute = (label: string) => /^(?:объем )?встроенн(?:ая|ой) памят(?:ь|и)$/.test(normalize(label))
const publicAttributes = (attributes: CatalogAttributeInput[] = []) => attributes.filter((attribute) => attribute.public && !attribute.label.startsWith("__"))
type ConfigurationAttribute = Pick<CatalogAttributeInput, "key" | "label"> & { values: { value: string }[] }

const single = (attributes: ConfigurationAttribute[], predicate: (label: string, attribute: ConfigurationAttribute) => boolean) => {
  const values = [...new Set(attributes.filter((attribute) => predicate(attribute.label, attribute)).flatMap((attribute) => attribute.values.map((value) => value.value.trim())).filter(Boolean))]
  return values.length === 1 ? values[0] : null
}

/** Preserve the exact imported selector labels independently of normalized search facets. */
export function snapshotLegacyConfigurationAttributes(attributes: CatalogAttributeInput[] | undefined, axes: string[], definitions: CatalogDefinitionData[]): ConfigurationAttribute[] {
  const codes = new Set([...axes, ...definitions.filter((definition) => definition.role === "color" || [definition.label, ...(definition.aliases ?? [])].some(storageAttribute)).map((definition) => definition.code)])
  return publicAttributes(attributes).filter(({ key, label }) => codes.has(key) || colorAttribute(label) || storageAttribute(label))
    .map(({ key, label, values }) => ({ key, label, values: values.map(({ value }) => ({ value })) }))
}

function legacyConfigurationAttributes(product: ConfigurationProduct, metadata?: Record<string, unknown>): ConfigurationAttribute[] {
  if (product.metadata?.catalog_origin === "manual") return []
  const snapshot = metadata?.[LEGACY_VARIATION_FACETS] as { configuration?: ConfigurationAttribute[] } | undefined
  return snapshot?.configuration ?? publicAttributes(product.catalog_record?.attributes)
}

export function storageValue(value: string | null): string | null {
  const match = value && normalize(value).match(/^(\d+(?:[.,]\d+)?)\s*(гб|gb|тб|tb)$/)
  return match ? `${Number(match[1].replace(",", "."))} ${/тб|tb/.test(match[2]) ? "ТБ" : "ГБ"}` : null
}

export function ownConfigurations(product: ConfigurationProduct, definitions: CatalogDefinitionData[] = [], original = false): ProductConfiguration[] {
  const useRam = definitions.some((definition) => definition.code === LIBRARY_RAM)
  const colorCodes = new Set(definitions.filter((definition) => definition.role === "color").map((definition) => definition.code))
  const storageCodes = new Set(definitions.filter((definition) => [definition.label, ...(definition.aliases ?? [])].some(storageAttribute)).map((definition) => definition.code))
  const isColor = (label: string, attribute: ConfigurationAttribute) => colorCodes.has(attribute.key) || colorAttribute(label)
  const isStorage = (label: string, attribute: ConfigurationAttribute) => storageCodes.has(attribute.key) || storageAttribute(label)
  return (product.variants ?? []).map((variant) => {
    const variantAttributes = publicAttributes(variant.catalog_variant?.attributes)
    const legacyCommon = legacyConfigurationAttributes(product, variant.metadata)
    const choices = original ? {} : libraryChoices(product.metadata, variant.id)
    const color = choices[LIBRARY_COLOR]
    const storage = Object.entries(choices).find(([code, choice]) => libraryChoiceChanged(choice) && storageCodes.has(code))?.[1]
    const ram = useRam ? ramAmount(choices[LIBRARY_RAM]?.choice ??
      ramLibraryChoice(variantAttributes, product.catalog_record?.attributes)?.choice ?? "") : null
    return {
      product_id: product.id, variant_id: variant.id, handle: product.handle,
      color: color && libraryChoiceChanged(color) ? color.value : single(variantAttributes, isColor) ?? single(legacyCommon, isColor),
      storage: catalogKind(product.metadata) === "phone"
        ? storageValue(storage?.value ?? single(variantAttributes, isStorage) ?? single(legacyCommon, isStorage)) : null,
      ...(useRam ? { ram: ram ? `${ram} ГБ` : null } : {}),
    }
  })
}

export function modelCategory(product: ConfigurationProduct) {
  if (catalogKind(product.metadata) !== "phone") return null
  const roots = new Set(["apple-iphone", "samsung", "xiaomi", "honor"])
  const leaves = (product.categories ?? []).filter((category) => !roots.has(category.handle) &&
    !(product.categories ?? []).some((child) => child.parent_category_id === category.id))
  return leaves.length === 1 ? leaves[0] : null
}

export function configurationModelCategory(product: ConfigurationProduct) {
  const model = modelCategory(product)
  if (model || !product.metadata?.catalog_family_id) return model
  const leaves = (product.categories ?? []).filter((category) => !(product.categories ?? []).some((child) => child.parent_category_id === category.id))
  return leaves.length === 1 ? leaves[0] : null
}

export function configurationAxisDefinitions(product: ConfigurationProduct, template: string[], definitions: CatalogDefinitionData[]) {
  const metadata = product.metadata ?? {}
  const native = Object.keys(metadata.catalog_constructor_axes ?? {})
  const order = Array.isArray(metadata.catalog_constructor_axis_order) ? metadata.catalog_constructor_axis_order : []
  const detached = detachedVariationFields(metadata)
  const configured = [...new Set([...order.filter((code) => typeof code === "string" && native.includes(code)), ...native])].filter((code) => !detached.has(canonicalLibraryCode(code)))
  const attachedRam = product.variants?.some(({ id }) => libraryChoices(metadata, id)[LIBRARY_RAM])
  const codes = [...new Set([...(metadata.insales_product_id ? template : []), ...configured, ...(attachedRam ? [LIBRARY_RAM] : [])])]
    .filter((code) => !detached.has(canonicalLibraryCode(code)))
  const axes = codes.map((code) => definitions.find((definition) => definition.code === code))
    .filter((definition): definition is CatalogDefinitionData => Boolean(definition?.public && definition.enabled))
  return { configured, axes }
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const ramMarker = (amount: string) => `(?:(?:ram|озу)\\s*[:=-]?\\s*${amount}\\s*(?:гб|gb)?|${amount}\\s*(?:гб|gb)?\\s*(?:ram|озу))`

/** Strip only verified configuration values. Model, regional and SIM
 * identifiers remain part of the family. */
function phoneConfigurationFamily(product: ConfigurationProduct, definitions: CatalogDefinitionData[]) {
  if (product.metadata?.catalog_origin === "manual" && !product.metadata?.catalog_family_id) return null
  const category = modelCategory(product)
  const rawBrand = catalogBrand(product.metadata)
  const brand = typeof rawBrand === "string" ? normalize(rawBrand) : ""
  const configurations = ownConfigurations(product, definitions, true)
  if (!category || !brand || !configurations.length || configurations.some((configuration) => !configuration.color || !configuration.storage)) return null
  const attributes = publicAttributes(product.catalog_record?.attributes)
  const axisCodes = new Set(definitions.map((definition) => definition.code))
  const hasRam = configurations.every((configuration) => configuration.ram)
  const ramNumbers = new Set(configurations.flatMap(({ ram }) => ram ? [escape(ramAmount(ram)!)] : []))
  const explicitFamily = typeof product.metadata?.catalog_family_id === "string" ? product.metadata.catalog_family_id.trim() : ""
  let title = explicitFamily ? `family ${explicitFamily}` : normalize(product.title)
  const colors = [...new Set(configurations.flatMap((configuration) => [configuration.color!, ...configuration.color!.split(/\s+-\s+/)]))].sort((a, b) => b.length - a.length)
  for (const color of colors) {
    title = title.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(normalize(color))}(?=$|[^\\p{L}\\p{N}])`, "gu"), "$1 ")
  }
  if (!explicitFamily && hasRam) for (const { ram, storage } of configurations) {
    const [amount, unit] = storage!.split(" ")
    const memory = unit === "ТБ" ? "тб|tb" : "гб|gb"
    const ramNumber = escape(ramAmount(ram!)!)
    title = title.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${ramNumber}\\s*(?:гб|gb)?\\s*/\\s*${escape(amount)}\\s*(?:${memory})(?=$|[^\\p{L}\\p{N}])`, "gu"), "$1 ")
    title = title.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${ramMarker(ramNumber)}(?=$|[^\\p{L}\\p{N}])`, "gu"), "$1 ")
  }
  for (const storage of new Set(configurations.map((configuration) => configuration.storage!))) {
    const [amount, unit] = storage.split(" ")
    title = title.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escape(amount)}\\s*(?:${unit === "ТБ" ? "тб|tb" : "гб|gb"})(?=$|[^\\p{L}\\p{N}])`, "gu"), "$1 ")
  }
  title = title.replace(/[^\p{L}\p{N}]+/gu, " ").trim()
  if (title.length < 6) return null
  // Compare all remaining public technical facts, including missing-vs-present.
  // Brand is already anchored to the importer brand; value ordering is immaterial.
  const ramMarkers = [...ramNumbers].map((amount) => new RegExp(`^${ramMarker(amount)}$`, "u"))
  const redundantRamModel = (attribute: CatalogAttributeInput) => normalize(attribute.label) === "модель" &&
    attribute.values.length > 0 && attribute.values.every(({ value }) => ramMarkers.some((pattern) => pattern.test(normalize(value))))
  const isTechnical = (attribute: CatalogAttributeInput) =>
    !axisCodes.has(attribute.key) && !(hasRam && (isRamAttribute(attribute) || redundantRamModel(attribute))) &&
    !colorAttribute(attribute.label) && !storageAttribute(attribute.label) && normalize(attribute.label) !== "бренд"
  const technical = attributes.filter(isTechnical)
    .map((attribute) => [normalize(attribute.label), attribute.values.map((value) => normalize(value.value)).sort()])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const variantTechnical = (product.variants ?? []).map((variant) => publicAttributes(variant.catalog_variant?.attributes)
    .filter(isTechnical)
    .map((attribute) => [normalize(attribute.label), attribute.values.map((value) => normalize(value.value)).sort()])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
  if (variantTechnical.some((facts) => JSON.stringify(facts) !== JSON.stringify(variantTechnical[0]))) return null
  return { key: JSON.stringify([category.id, brand, explicitFamily ? `explicit:${explicitFamily}` : title, technical, variantTechnical[0] ?? [], ...(hasRam ? [LIBRARY_RAM] : [])]), title }
}

export function configurationFamilyKey(product: ConfigurationProduct, definitions: CatalogDefinitionData[] = []): string | null {
  return phoneConfigurationFamily(product, definitions)?.key ?? null
}

export function inferredProductFamily(product: ConfigurationProduct, definitions: CatalogDefinitionData[]) {
  if (!product.metadata?.insales_product_id || product.metadata.catalog_family_id) return null
  const family = phoneConfigurationFamily(product, definitions)
  if (!family) return null
  const words = new Map((product.title.match(/[\p{L}\p{N}]+/gu) ?? []).map((word) => [normalize(word), word] as const))
  const beforeRam = definitions.some(({ code }) => code === LIBRARY_RAM)
    ? phoneConfigurationFamily(product, definitions.filter(({ code }) => code !== LIBRARY_RAM)) : null
  return {
    id: catalogStableId("family-auto", family.key),
    legacyId: beforeRam && beforeRam.key !== family.key ? catalogStableId("family-auto", beforeRam.key) : undefined,
    label: family.title.split(" ").map((word) => words.get(word) ?? word).join(" "),
  }
}

export function selectedFamilyKey(product: ConfigurationProduct, familyId: string) {
  const category = configurationModelCategory(product)
  const brand = catalogBrand(product.metadata)
  const kind = catalogKind(product.metadata)
  return category && typeof brand === "string" && brand.trim() && kind
    ? JSON.stringify([category.id, normalize(brand), kind, familyId])
    : null
}

export function familyConfigurations(current: ConfigurationProduct, candidates: ConfigurationProduct[], definitions: CatalogDefinitionData[] = []) {
  const own = ownConfigurations(current, definitions)
  const key = configurationFamilyKey(current, definitions)
  if (!key) return own
  const configurations = candidates.filter((candidate) => candidate.metadata?.catalog_scope === current.metadata?.catalog_scope && (candidate.metadata?.insales_product_id || candidate.metadata?.catalog_origin === "manual") && configurationFamilyKey(candidate, definitions) === key).flatMap((candidate) => ownConfigurations(candidate, definitions))
  const pair = ({ color, storage, ram }: ProductConfiguration) => JSON.stringify([color, storage, ram])
  const grouped = new Map<string, ProductConfiguration[]>()
  for (const configuration of configurations) grouped.set(pair(configuration), [...(grouped.get(pair(configuration)) ?? []), configuration])
  // A color/storage pair with competing source identities has no safe automatic
  // target. Keep the actual open product and exclude ambiguous sibling targets.
  return [...own, ...configurations.filter((configuration) => configuration.product_id !== current.id && grouped.get(pair(configuration))?.length === 1 && !own.some((item) => pair(item) === pair(configuration)))]
}

function configuredAxes(product: ConfigurationProduct, variantId: string, definitions: CatalogDefinitionData[]) {
  const variant = product.variants?.find((item) => item.id === variantId)
  const own = ownConfigurations(product, definitions).find((item) => item.variant_id === variantId)
  const legacyCommon = legacyConfigurationAttributes(product, variant?.metadata)
  const choices = libraryChoices(product.metadata, variantId)
  const detached = detachedVariationFields(product.metadata)
  return Object.fromEntries(definitions.map((definition) => {
    const code = canonicalLibraryCode(definition.code)
    if (detached.has(code)) return [definition.code, null]
    if (code === LIBRARY_RAM) return [definition.code, own?.ram ?? null]
    const choice = choices[code]
    if (choice && libraryChoiceChanged(choice)) return [definition.code, choice.value]
    const variantValues = publicAttributes(variant?.catalog_variant?.attributes).filter((attribute) => attribute.key === definition.code).flatMap((attribute) => attribute.values.map((value) => value.value))
    const legacyValues = legacyCommon.filter((attribute) => attribute.key === definition.code).flatMap((attribute) => attribute.values.map((value) => value.value))
    const values = [...new Set(variantValues.length ? variantValues : legacyValues)]
    const legacy = definition.role === "color" ? own?.color : catalogKind(product.metadata) === "phone" && storageAttribute(definition.label) ? own?.storage : null
    return [definition.code, values.length === 1 ? values[0] : legacy ?? null]
  }))
}

export function configuredFamilyKey(product: ConfigurationProduct, definitions: CatalogDefinitionData[]): string | null {
  const selected = product.metadata?.catalog_family_id
  if (isNamedFamilyId(selected) || isInferredFamilyId(selected)) {
    const choices = ownConfigurations(product, definitions)
    if (!choices.length || (catalogKind(product.metadata) === "phone" && !detachedVariationFields(product.metadata).size &&
      choices.some(({ color, storage }) => !color || !storage))) return null
    return selectedFamilyKey(product, selected)
  }
  if (catalogKind(product.metadata) === "phone") return configurationFamilyKey(product, definitions)
  const family = product.metadata?.catalog_family_id
  const brand = catalogBrand(product.metadata)
  const categories = (product.categories ?? []).filter((category) => !(product.categories ?? []).some((child) => child.parent_category_id === category.id))
  if (typeof family !== "string" || !family || typeof brand !== "string" || !brand || categories.length !== 1 || !definitions.length || !product.variants?.length) return null
  const codes = new Set(definitions.map((definition) => definition.code))
  const facts = (attributes: CatalogAttributeInput[] = []) => publicAttributes(attributes).filter((attribute) => !codes.has(attribute.key)).map((attribute) => [attribute.key, attribute.values.map((value) => normalize(value.value)).sort()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const variantFacts = product.variants.map((variant) => facts(variant.catalog_variant?.attributes))
  if (variantFacts.some((value) => JSON.stringify(value) !== JSON.stringify(variantFacts[0])) || product.variants.some((variant) => Object.values(configuredAxes(product, variant.id, definitions)).some((value) => !value))) return null
  return JSON.stringify([catalogKind(product.metadata), categories[0].id, normalize(brand), family, facts(product.catalog_record?.attributes), variantFacts[0]])
}

export function configuredProductConfigurations(current: ConfigurationProduct, candidates: ConfigurationProduct[], definitions: CatalogDefinitionData[], templateDefinitions = definitions): ProductConfiguration[] {
  const selected = current.metadata?.catalog_family_id
  const hasManualLinks = isInferredFamilyId(selected) || candidates.some((candidate) => isInferredFamilyId(candidate.metadata?.catalog_family_id))
  const references = new Map(hasManualLinks ? [...candidates, current].flatMap((candidate) => {
    const family = inferredProductFamily(candidate, templateDefinitions)
    return family ? [[candidate.id, family] as const] : []
  }) : [])
  const aliases = new Map([...references.values()].flatMap(({ id, legacyId }) => legacyId ? [[legacyId, id] as const] : []))
  const familyOf = (product: ConfigurationProduct) => {
    const code = product.metadata?.catalog_family_id
    return isInferredFamilyId(code) ? aliases.get(code) ?? code : references.get(product.id)?.id
  }
  const inferred = hasManualLinks ? familyOf(current) : undefined
  if (inferred && (isInferredFamilyId(selected) || candidates.some((candidate) => isInferredFamilyId(candidate.metadata?.catalog_family_id) && familyOf(candidate) === inferred))) {
    const key = selectedFamilyKey(current, inferred)
    const scoped = candidates.filter((candidate) => candidate.metadata?.catalog_scope === current.metadata?.catalog_scope &&
      key && selectedFamilyKey(candidate, inferred) === key &&
      familyOf(candidate) === inferred)
    const configurations = (product: ConfigurationProduct) => ownConfigurations(product, definitions).map((configuration) => ({
      ...configuration, axes: Object.fromEntries(Object.entries(configuredAxes(product, configuration.variant_id, definitions)).map(([code, value]) => [
        code, storageAttribute(definitions.find((definition) => definition.code === code)?.label ?? "") ? configuration.storage : value,
      ])),
    }))
    const own = configurations(current)
    const siblings = scoped.filter((candidate) => candidate.id !== current.id).flatMap(configurations)
    return uniqueSiblingConfigurations(own, siblings)
  }
  if (catalogKind(current.metadata) === "phone" && !selected) return familyConfigurations(current, candidates, templateDefinitions).map((configuration) => ({ ...configuration, axes: configuredAxes(candidates.find((candidate) => candidate.id === configuration.product_id) ?? current, configuration.variant_id, definitions) }))
  const own = ownConfigurations(current, definitions).map((configuration) => ({ ...configuration, axes: configuredAxes(current, configuration.variant_id, definitions) }))
  const key = configuredFamilyKey(current, definitions)
  if (!key) return own
  const siblings = candidates.filter((candidate) => candidate.id !== current.id && candidate.metadata?.catalog_scope === current.metadata?.catalog_scope && configuredFamilyKey(candidate, definitions) === key).flatMap((candidate) => ownConfigurations(candidate, definitions).map((configuration) => ({ ...configuration, axes: configuredAxes(candidate, configuration.variant_id, definitions) })))
  return uniqueSiblingConfigurations(own, siblings)
}

function uniqueSiblingConfigurations(own: ProductConfiguration[], siblings: ProductConfiguration[]) {
  const pair = (configuration: ProductConfiguration) => JSON.stringify(configuration.axes)
  const ownPairs = new Set(own.map(pair))
  const counts = new Map<string, number>()
  for (const sibling of siblings) counts.set(pair(sibling), (counts.get(pair(sibling)) ?? 0) + 1)
  return [...own, ...siblings.filter((configuration) => !ownPairs.has(pair(configuration)) && counts.get(pair(configuration)) === 1)]
}

/** An axis picker can only move between rows differing in one value. */
export function configurationPickerNeedsList(configurations: ProductConfiguration[], codes: string[]) {
  if (configurations.length < 2 || !codes.length) return false
  const masked = configurations.map((configuration) => codes.map((_, omitted) => JSON.stringify(
    codes.map((code, index) => index === omitted ? null : configuration.axes?.[code] ?? ""),
  )))
  const groups = new Map<string, number[]>()
  for (const [index, keys] of masked.entries()) for (const key of keys) {
    const group = groups.get(key) ?? []
    group.push(index)
    groups.set(key, group)
  }
  const reachable = new Set([0])
  for (const index of reachable) for (const key of masked[index]) {
    for (const sibling of groups.get(key) ?? []) reachable.add(sibling)
    groups.delete(key)
  }
  return reachable.size !== configurations.length
}
