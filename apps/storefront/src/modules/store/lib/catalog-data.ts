/** Shared URL and card contract for the Medusa-backed catalog. */
export type CatalogState = {
  q: string
  category: string
  min: string
  max: string
  options: string[]
  sale: boolean
  sort: string
  page: number
}

export type CatalogPreviewProduct = {
  id: string
  title: string
  image: string
  price: number
  oldPrice: number
  currency: string
  category: string
  popular: boolean
  sourceUrl: string
}

export type CatalogProduct = {
  id: string
  title: string
  image: string
  price: number | null
  oldPrice: number
  currency: string
  href?: string
  preview?: CatalogPreviewProduct
  categoryKeys: string[]
  options: Record<string, string[]>
}

export type CatalogOptionGroup = {
  code?: string
  control?: "checkbox" | "swatch" | "range"
  role?: "spec" | "color" | "variant_axis"
  colorSwatches?: Record<string, string>
  key: string
  label: string
  values: { value: string; label: string }[]
}

export type CatalogResult = {
  products: CatalogProduct[]
  total: number
  page: number
  pages: number
  optionGroups: CatalogOptionGroup[]
  minPrice: number
  maxPrice: number
  currency: string
}

export const CATALOG_PAGE_SIZE = 12
// Synchronous cancellation boundary for local drafts and delayed callbacks.
export const CATALOG_CONTEXT_EVENT = "texno-catalog-context"

/** Keep in parity with backend search/helpers/catalog-filter-values.ts. */
export function canonicalCatalogToken(value: string): string {
  return value.normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*:\s*/g, ":")
    .replace(/^объем встроенной памяти(?=:|$)/, "встроенная память")
    .replace(/(\d+(?:[.,]\d+)?)\s*(гб|gb|мб|mb|тб|tb)(?=$|[\s,;/)])/g, (_match, amount: string, unit: string) => {
      const units: Record<string, string> = { гб: "gb", gb: "gb", мб: "mb", mb: "mb", тб: "tb", tb: "tb" }
      return `${amount.replace(",", ".")} ${units[unit]}`
    })
}

export const initialCatalogState: CatalogState = {
  q: "",
  category: "",
  min: "",
  max: "",
  options: [],
  sale: false,
  sort: "featured",
  page: 1,
}

/** Tree navigation starts a new selection; ordering is a browsing preference. */
export function navigateCatalogState(current: CatalogState, category: string): CatalogState {
  return { ...initialCatalogState, category, sort: current.sort, sale: category === "sale", options: [] }
}

const sortValues = new Set([
  "featured", "price_asc", "price_desc", "title_asc", "title_desc",
])
const stateKeys = ["q", "category", "min", "max", "option", "sale", "sort", "page"]

function validAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function priceParam(value: string | null): string {
  if (!value?.trim()) return ""
  const amount = Number(value.replace(",", "."))
  return validAmount(amount) === null ? "" : String(amount)
}

export function splitCatalogOption(value: string): { key: string; label: string } | null {
  const colon = value.indexOf(":")
  if (colon < 1) return null
  const key = value.slice(0, colon).trim()
  const label = value.slice(colon + 1).trim()
  return key && label ? { key, label } : null
}

export function parseCatalogState(params: URLSearchParams): CatalogState {
  const requestedPage = Number(params.get("page"))
  const sort = params.get("sort") || "featured"
  const options = params.getAll("option")
    .filter((value) => value.length <= 200 && splitCatalogOption(value))
    .slice(0, 50)

  const seenOptions = new Set<string>()
  const distinctOptions = options.filter((option) => {
    const token = canonicalCatalogToken(option)
    if (seenOptions.has(token)) return false
    seenOptions.add(token)
    return true
  })
  return {
    q: (params.get("q") || "").trim().slice(0, 200),
    category: (params.get("category") || "").trim().slice(0, 200),
    min: priceParam(params.get("min")),
    max: priceParam(params.get("max")),
    options: distinctOptions,
    sale: params.get("sale") === "1",
    sort: sortValues.has(sort) ? sort : "featured",
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  }
}

/** Preserve campaign parameters and other URL state owned outside the catalog. */
export function serializeCatalogState(
  state: CatalogState,
  existing?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams(existing)
  stateKeys.forEach((key) => params.delete(key))
  if (state.q.trim()) params.set("q", state.q.trim())
  if (state.category) params.set("category", state.category)
  if (priceParam(state.min)) params.set("min", priceParam(state.min))
  if (priceParam(state.max)) params.set("max", priceParam(state.max))
  Array.from(new Set(state.options)).forEach((value) => {
    if (splitCatalogOption(value)) params.append("option", value)
  })
  if (state.sale) params.set("sale", "1")
  if (sortValues.has(state.sort) && state.sort !== "featured") params.set("sort", state.sort)
  if (Number.isSafeInteger(state.page) && state.page > 1) params.set("page", String(state.page))
  return params
}

function stringValues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string =>
    typeof item === "string" && item.trim().length > 0
  ).map((item) => item.trim())))
}

/** Group the actual option facets emitted by Medusa; no static attribute list. */
export type CatalogDefinition = { code: string; label: string; aliases: string[]; filterable: boolean; position: number; role?: "spec" | "color" | "variant_axis"; filter_control?: "checkbox" | "swatch" | "range"; choice_colors?: Record<string, string> }
export function catalogOptionGroups(
  values: string[],
  definitions?: CatalogDefinition[],
  allowedCodes?: string[] | null,
  disabledCodes?: string[]
): CatalogOptionGroup[] {
  const groups = new Map<string, CatalogOptionGroup>()
  const approvedLabels = new Map<string, { label: string; definition?: CatalogDefinition }>()
  const positions = new Map<string, number>()
  if (definitions) {
    for (const definition of definitions) {
      if (!definition.filterable || disabledCodes?.includes(definition.code)) continue
      if (Array.isArray(allowedCodes) && !allowedCodes.includes(definition.code)) continue
      for (const label of [definition.label, ...(definition.aliases ?? [])]) {
        approvedLabels.set(canonicalCatalogToken(label), { label: definition.label, definition })
      }
      positions.set(definition.code, definition.position)
    }
  } else {
    for (const label of ["Цвет", "Встроенная память", "Диагональ", "Количество ядер процессора", "Сканер отпечатка пальца"]) {
      approvedLabels.set(canonicalCatalogToken(label), { label })
    }
  }
  const seen = new Set<string>()
  // Sorting makes the representative display label independent of facet counts.
  for (const value of Array.from(new Set(values)).sort()) {
    const option = splitCatalogOption(value)
    if (!option) continue
    const group = approvedLabels.get(canonicalCatalogToken(option.key))
    if (!group) continue
    const { label: displayKey, definition } = group
    const groupKey = definition?.code ?? canonicalCatalogToken(displayKey)
    const token = JSON.stringify([groupKey, canonicalCatalogToken(`${displayKey}:${option.label}`)])
    if (seen.has(token)) continue
    seen.add(token)
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        key: displayKey, label: displayKey, values: [],
        ...(definition ? { code: definition.code, role: definition.role, control: definition.filter_control } : {}),
        ...(definition?.choice_colors ? { colorSwatches: definition.choice_colors } : {}),
      })
    }
    groups.get(groupKey)!.values.push({ value: `${displayKey}:${option.label}`, label: option.label })
  }
  return Array.from(groups.values()).sort((a, b) => (positions.get(a.code ?? a.key) ?? 0) - (positions.get(b.code ?? b.key) ?? 0)).map((group) => ({
    ...group,
    values: group.values.sort((a, b) => a.label.localeCompare(b.label, "ru", { numeric: true })),
  }))
}

/**
 * Search documents carry amounts in display units. The caller supplies an
 * indexed currency (for example rub); no exchange-rate conversion is applied.
 * Example products are also read from Medusa, with an explicit example marker.
 */
export function adaptMedusaHit(hit: Record<string, unknown>, currency: string, saleOnly = false): CatalogProduct {
  const currencyCode = currency.toLowerCase()
  const price = validAmount(hit[`${saleOnly ? "min_sale_price" : "min_price"}_${currencyCode}`])
  const oldPrice = validAmount(hit[`${saleOnly ? "original_sale_price" : "original_price"}_${currencyCode}`]) ?? price ?? 0
  const title = typeof hit.title === "string" ? hit.title : "Товар"
  const image = typeof hit.thumbnail === "string" ? hit.thumbnail : ""
  const handle = typeof hit.handle === "string" ? hit.handle : ""
  const id = typeof hit.id === "string" ? hit.id
    : typeof hit.objectID === "string" ? hit.objectID : handle
  const categoryKeys = stringValues(hit.category)
  const options: Record<string, string[]> = Object.create(null)
  for (const value of stringValues(hit.option_values)) {
    const option = splitCatalogOption(value)
    if (!option) continue
    options[option.key] ??= []
    if (!options[option.key].includes(option.label)) options[option.key].push(option.label)
  }
  const metadata = hit.metadata && typeof hit.metadata === "object"
    ? hit.metadata as Record<string, unknown> : {}
  const isExample = hit.is_catalog_example === true || metadata.catalog_example === true

  return {
    id, title, image, price, oldPrice,
    currency: currencyCode.toUpperCase(),
    href: handle ? `/products/${encodeURIComponent(handle)}` : undefined,
    categoryKeys,
    options,
    ...(isExample && price !== null ? {
      preview: {
        id, title, image, price, oldPrice,
        currency: currencyCode.toUpperCase(),
        category: categoryKeys[0] ?? "",
        popular: true,
        sourceUrl: "",
      },
    } : {}),
  }
}
