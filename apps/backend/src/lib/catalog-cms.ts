import { createHash } from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { isProductSpecificationCode } from "./product-specification"
import { cachedCatalogRead } from "./catalog-read-cache"

export type CatalogDefinitionData = {
  id: string; code: string; label: string; type: "text" | "number" | "boolean" | "money"; unit: string | null
  public: boolean; filterable: boolean; position: number; enabled: boolean
  created_at?: string | Date
  aliases?: string[]
  choice_values?: string[]
  choice_colors?: Record<string, string> | null
  role?: "spec" | "color" | "variant_axis"
  filter_control?: "checkbox" | "swatch" | "range"
}

export const catalogStableId = (prefix: string, value: string) => `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 32)}`
export const normalizeCatalogValue = (value: string) => value.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim()
export const catalogKind = (metadata: Record<string, unknown> = {}) => metadata.catalog_kind ?? metadata.insales_kind
export const catalogBrand = (metadata: Record<string, unknown> = {}) => metadata.catalog_brand ?? metadata.insales_brand

export function matchesCatalogAttributeValues(attribute: CatalogAttributeInput, values: string[] | undefined) {
  const sent = JSON.stringify(values)
  const displayed = attribute.values.map(({ value }) => value)
  const editable = attribute.values.map((value) => attribute.dataType === "number" && value.numericValue !== null ? String(value.numericValue) : value.value)
  return sent === JSON.stringify(displayed) || sent === JSON.stringify(editable)
}

export async function getCatalogProfile(container: MedusaContainer) {
  return cachedCatalogRead(container, "profile", ["CatalogProfile:list:*", "Region:list:*"], async () => {
  const [profile] = await container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE).listCatalogProfiles({ key: "store" })
  if (!profile) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Настройте профиль каталога в Admin")
  const { data: regions } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "region", fields: ["id", "currency_code", "name"], filters: { id: profile.region_id } })
  if (!regions[0]) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Регион профиля каталога недоступен")
  return { id: profile.id, scope: profile.scope, region_id: profile.region_id, currency_code: regions[0].currency_code, product_types: profile.product_types }
  })
}

export function normalizeCmsAttributes(rows: { code: string; values: string[] }[], definitions: CatalogDefinitionData[], previous: CatalogAttributeInput[] = [], libraryFields = new Set<string>()): CatalogAttributeInput[] {
  return rows.map((row) => {
    const definition = definitions.find((item) => item.code === row.code)
    if (!definition) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Недоступная характеристика: ${row.code}`)
    const existing = previous.find((attribute) => attribute.key === row.code)
    // An unchanged source assignment is lossless even when the legacy source
    // mixes numeric/text values under one stable definition. Editing another
    // field never coerces such facts or rewrites their original display units.
    if (existing && matchesCatalogAttributeValues(existing, row.values)) return { ...existing, label: definition.label, public: definition.public && definition.enabled, filterable: definition.public && definition.enabled && definition.filterable, legacyLabels: definition.aliases ?? [], cmsManaged: true }
    if (!definition.enabled) throw new MedusaError(MedusaError.Types.INVALID_DATA, `Недоступная характеристика: ${row.code}`)
    const values = [...new Set(row.values.map((value) => value.trim()))].map((value) => {
      let numericValue: number | null = null
      if (definition.type === "number" || definition.type === "money") {
        const numeric = value.replace(/\s+/g, "").replace(",", ".")
        if (!/^-?\d+(?:\.\d+)?$/.test(numeric) || !Number.isFinite(Number(numeric))) {
          if (libraryFields.has(row.code) && definition.choice_values?.includes(value)) {
            return { value, normalized: normalizeCatalogValue(value), numericValue: null, unit: null }
          }
          throw new MedusaError(MedusaError.Types.INVALID_DATA, `«${definition.label}»: укажите число без единицы измерения`)
        }
        numericValue = Number(numeric)
        if (definition.type === "money" && (numericValue < 0 || numericValue > 100000000)) throw new MedusaError(MedusaError.Types.INVALID_DATA, `«${definition.label}»: сумма должна быть от 0 до 100 000 000`)
      }
      if (definition.type === "boolean" && !["да", "есть", "нет", "true", "false", "1", "0"].includes(normalizeCatalogValue(value))) throw new MedusaError(MedusaError.Types.INVALID_DATA, `«${definition.label}»: допустимо Да или Нет`)
      let canonical = value
      if (definition.type === "boolean") {
        canonical = normalizeCatalogValue(value) === "есть" ? "есть" : ["да", "true", "1"].includes(normalizeCatalogValue(value)) ? "Да" : "Нет"
      } else if (numericValue !== null) {
        canonical = `${numericValue}${definition.unit ? ` ${definition.unit}` : ""}`
        if (definition.type === "money" && definition.unit) {
          const format = new Intl.NumberFormat("ru-RU", { style: "currency", currency: definition.unit })
          const digits = format.resolvedOptions().maximumFractionDigits ?? 2
          if (Number(numericValue.toFixed(digits)) !== numericValue) throw new MedusaError(MedusaError.Types.INVALID_DATA, `«${definition.label}»: слишком много знаков после запятой для ${definition.unit}`)
          canonical = format.format(numericValue)
        }
      }
      return { value: canonical, normalized: normalizeCatalogValue(canonical), numericValue, unit: definition.unit }
    })
    const uniqueValues = [...new Map(values.map((value) => [value.normalized, value])).values()]
    return { key: definition.code, label: definition.label, rawValues: row.values, values: uniqueValues, dataType: definition.type === "money" ? "number" : definition.type, public: definition.public, filterable: definition.public && definition.filterable, legacyLabels: definition.aliases ?? [], cmsManaged: true }
  }).sort((a, b) => definitions.find((d) => d.code === a.key)!.position - definitions.find((d) => d.code === b.key)!.position)
}

export function normalizeProductSpecifications(rows: { code: string; label?: string; values: string[] }[], definitions: CatalogDefinitionData[], previous: CatalogAttributeInput[] = []) {
  const local = rows.flatMap(({ code, label }) => {
    if (!isProductSpecificationCode(code)) {
      if (label !== undefined) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Названия добавляются только к характеристикам этой карточки")
      return []
    }
    const title = label ?? previous.find((attribute) => attribute.key === code)?.label
    if (!title || title.startsWith("__")) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Укажите название характеристики")
    return [{
      id: code, code, label: title, type: "text" as const, unit: null,
      public: true, enabled: true, filterable: false, position: 10000,
    }]
  })
  return normalizeCmsAttributes(rows, [...definitions, ...local], previous)
}

export function cmsAttributeRows(recordId: string, variantId: string | null, attributes: CatalogAttributeInput[]) {
  return attributes.filter((attribute) => attribute.public && !attribute.label.startsWith("__")).flatMap((attribute) => attribute.values.map((value) => ({
    id: catalogStableId("catattr", `${recordId}:${variantId || "product"}:${attribute.key}:${value.normalized}`),
    key: attribute.key, label: attribute.label, raw_value: attribute.rawValues.join("##"), value: value.value,
    normalized_value: value.normalized, type: attribute.dataType, numeric_value: value.numericValue,
    unit: value.unit, filterable: attribute.filterable, scope: variantId ? "variant" as const : "product" as const,
    record_id: recordId, variant_id: variantId,
  })))
}
