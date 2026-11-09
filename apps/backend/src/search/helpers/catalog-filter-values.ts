/** Canonical filter identity only; source and display strings stay unchanged. */
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
