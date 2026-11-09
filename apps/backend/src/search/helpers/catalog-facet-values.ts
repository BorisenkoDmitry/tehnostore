import { canonicalCatalogToken } from "./catalog-filter-values"
import { ProductOptionRow, toOptionValues } from "./option-values"
import { catalogBrand, catalogKind } from "../../lib/catalog-cms"

type Attribute = { key?: string; label: string; filterable: boolean; public?: boolean; cmsManaged?: boolean; legacyLabels?: string[]; values: { value: string }[] }
type CatalogFacetProduct = {
  metadata?: Record<string, unknown> | null
  options?: ProductOptionRow[] | null
  catalog_record?: { attributes?: Attribute[] } | null
  variants?: { catalog_variant?: { attributes?: Attribute[] } | null }[] | null
}

const phoneLabels = new Map([
  ["цвет", "Цвет"],
  ["встроенная память", "Встроенная память"],
  ["диагональ", "Диагональ"],
  ["количество ядер процессора", "Количество ядер процессора"],
  ["сканер отпечатка пальца", "Сканер отпечатка пальца"],
])
const legacyHierarchyKeys = new Set(["тип товара", "бренд", "модель", "модель устройства", "тип аксессуара", "тип"])

/** User-approved browsing facets only; full public attributes remain in the module/search text. */
export function catalogFacetValues(product: CatalogFacetProduct): string[] {
  const kind = catalogKind(product.metadata ?? {})
  const axes = product.metadata?.catalog_constructor_axes as Record<string, string> | undefined
  const axisTitles = new Set(Object.values(axes ?? {}))
  const nativeValues = toOptionValues(product.options?.filter((option) => !axisTitles.has(option?.title ?? "")))
  const common = (product.catalog_record?.attributes ?? []).filter((attribute) => !attribute.key || !axes?.[attribute.key])
  // Standard merchandising pages retain their own established option contract.
  if (kind !== "phone" && kind !== "accessory") return [...new Set([...nativeValues, ...common, ...(product.variants ?? []).flatMap((variant) => variant.catalog_variant?.attributes ?? [])].flatMap((item) => typeof item === "string" ? [item] : item.public !== false && item.filterable && item.cmsManaged ? item.values.map((value) => `${item.label}:${value.value}`) : []))]
  const attributes = [...common, ...(product.variants ?? []).flatMap((variant) => variant.catalog_variant?.attributes ?? [])]
  const allowedLabels = new Map(kind === "phone" ? phoneLabels : [["цвет", "Цвет"]])
  for (const attribute of attributes) if (attribute.cmsManaged && attribute.filterable && attribute.public !== false && canonicalCatalogToken(attribute.label) !== "цвет варианта") allowedLabels.set(canonicalCatalogToken(attribute.label), attribute.label)
  const variantAttributes = (product.variants ?? []).flatMap((variant) => variant.catalog_variant?.attributes ?? [])
  const variantColors = variantAttributes
    .filter((attribute) => canonicalCatalogToken(attribute.label) === "цвет варианта" && !Object.values(axes ?? {}).some((title) => canonicalCatalogToken(title) === "цвет"))
    .flatMap((attribute) => attribute.values.map((value) => `Цвет:${value.value}`))
  const toApprovedValue = (value: string): string | null => {
    const colon = value.indexOf(":")
    if (colon < 1) return null
    const key = canonicalCatalogToken(value.slice(0, colon))
    const label = allowedLabels.get(key)
    if (!label || (variantColors.length && key === "цвет")) return null
    return `${label}:${value.slice(colon + 1)}`
  }
  const attributeValues = attributes
    .filter((attribute) => attribute.filterable && attribute.public !== false)
    .flatMap((attribute) => attribute.values.map((value) => `${attribute.label}:${value.value}`))
  return Array.from(new Set([
    ...[...nativeValues, ...attributeValues].map(toApprovedValue).filter((value): value is string => value !== null),
    ...variantColors,
  ]))
}

/** Historical option-label URLs remain usable after a CMS label rename. */
export function catalogAliasFilterValues(product: CatalogFacetProduct): string[] {
  return [...(product.catalog_record?.attributes ?? []), ...(product.variants ?? []).flatMap((variant) => variant.catalog_variant?.attributes ?? [])]
    .filter((attribute) => attribute.filterable && attribute.public !== false)
    .flatMap((attribute) => (attribute.legacyLabels ?? []).flatMap((label) => attribute.values.map((value) => `${label}:${value.value}`)))
}

/** Keep existing saved hierarchy URLs usable without advertising extra facet groups. */
export function legacyCatalogHierarchyValues(product: CatalogFacetProduct): string[] {
  const attributes = (product.catalog_record?.attributes ?? [])
    .filter((attribute) => attribute.filterable && legacyHierarchyKeys.has(canonicalCatalogToken(attribute.label)))
    .flatMap((attribute) => attribute.values.map((value) => `${attribute.label}:${value.value}`))
  const kind = catalogKind(product.metadata ?? {})
  const brand = catalogBrand(product.metadata ?? {})
  return Array.from(new Set([
    ...attributes,
    ...(kind === "phone" ? ["Тип товара:Телефоны"] : kind === "accessory" ? ["Тип товара:Аксессуары"] : []),
    ...(typeof brand === "string" && brand ? [`Бренд:${brand}`] : []),
  ]))
}
