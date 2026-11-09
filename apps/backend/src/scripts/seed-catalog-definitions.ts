import { ExecArgs } from "@medusajs/framework/types"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { normalizeCatalogValue } from "../lib/catalog-cms"

const defaultFilters = new Set(["цвет", "цвет варианта", "встроенная память", "объем встроенной памяти", "диагональ", "количество ядер процессора", "сканер отпечатка пальца"])
const defaultOrder = new Map([["цвет", 0], ["цвет варианта", 0], ["встроенная память", 1], ["объем встроенной памяти", 1], ["диагональ", 2], ["количество ядер процессора", 3], ["сканер отпечатка пальца", 4]])

/** Idempotent, additive migration of source schema. Existing administrator
 * definitions and imported attribute snapshots are never overwritten. */
export default async function seedCatalogDefinitions({ container }: ExecArgs) {
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const records = await service.listCatalogRecords({}, { take: 10000 })
  const variants = await service.listCatalogVariants({}, { take: 10000 })
  const current = await service.listCatalogDefinitions({}, { take: 1000 })
  const existing = new Set(current.map((definition) => definition.code))
  const edited = new Set((await service.listCatalogChanges({ action: "definition-save" }, { take: 10000 })).map((change) => change.reason))
  const sourceCodes = new Set([...records, ...variants].flatMap((item) => item.attributes.filter((attribute) => !attribute.cmsManaged).map((attribute) => attribute.key)))
  const sourcePositions = new Map([...sourceCodes].sort().map((code, index) => [code, 100 + index]))
  for (const definition of current) if (sourceCodes.has(definition.code) && !edited.has(definition.code)) await service.updateCatalogDefinitions({ id: definition.id, filterable: definition.public && defaultFilters.has(normalizeCatalogValue(definition.label)), position: defaultOrder.get(normalizeCatalogValue(definition.label)) ?? sourcePositions.get(definition.code)! })
  const definitions = new Map<string, any>()
  for (const item of [...records, ...variants]) for (const attribute of item.attributes) {
    if (existing.has(attribute.key) || definitions.has(attribute.key)) continue
    const units = [...new Set(attribute.values.map((value) => value.unit).filter(Boolean))]
    definitions.set(attribute.key, { code: attribute.key, label: attribute.label, type: attribute.dataType, unit: units.length === 1 ? units[0] : null, public: attribute.public, filterable: attribute.public && defaultFilters.has(normalizeCatalogValue(attribute.label)), position: defaultOrder.get(normalizeCatalogValue(attribute.label)) ?? sourcePositions.get(attribute.key) ?? 1000 + definitions.size, enabled: true })
  }
  if (definitions.size) await service.createCatalogDefinitions([...definitions.values()])
  container.resolve("logger").info(`Catalog definitions: added ${definitions.size}, existing ${existing.size}`)
}
