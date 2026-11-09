import type { CatalogDefinitionData } from "./catalog-cms"

const token = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("ru").replace(/ё/g, "е")

/** Matches native options to the store's configured axes by label or alias.
 * Native option and variant IDs remain untouched. Ambiguous labels are ignored. */
export function nativeCatalogAxes(options: { id: string; title: string }[], codes: string[], definitions: CatalogDefinitionData[]) {
  return definitions.flatMap((definition) => {
    if (!codes.includes(definition.code) || !definition.enabled || !definition.public) return []
    const labels = new Set([definition.label, ...(definition.aliases ?? [])].map(token))
    const matches = options.filter((option) => labels.has(token(option.title)))
    return matches.length === 1 ? [{ code: definition.code, title: matches[0].title, id: matches[0].id }] : []
  })
}

export function includeNativeAxisValues(rows: { code: string; values: string[] }[], options: { option_id: string; value: string }[], axes: ReturnType<typeof nativeCatalogAxes>) {
  return [...rows, ...axes.flatMap((axis) => {
    if (rows.some((row) => row.code === axis.code)) return []
    const selected = options.find((option) => option.option_id === axis.id)?.value
    return selected ? [{ code: axis.code, values: [selected] }] : []
  })]
}
