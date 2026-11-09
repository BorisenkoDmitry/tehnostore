import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { normalizeCatalogValue } from "../lib/catalog-cms"
import { LIBRARY_RAM } from "../lib/catalog-variation-library"

/** Store-specific bootstrap only. Reusable readers and workflows do not infer
 * assortment, currency or attribute semantics from these labels. */
export default async function seedCatalogProfile({ container }: ExecArgs) {
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const [existing] = await service.listCatalogProfiles({ key: "store" })
  if (existing) { console.log(JSON.stringify({ profile: existing.id, unchanged: true })); return }
  const { data: regions } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "region", fields: ["id", "metadata", "currency_code"] })
  const region = regions.find((item) => item.metadata?.texno_checkout === true)
  if (!region) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Configure the native store region first")
  const definitions = await service.listCatalogDefinitions({}, { take: 1000 })
  const byLabel = (labels: string[]) => definitions.find((definition) => labels.includes(normalizeCatalogValue(definition.label)))?.code
  const color = definitions.find((definition) => definition.code === "variant_color")?.code ?? byLabel(["цвет"])
  const storage = byLabel(["объем встроенной памяти", "встроенная память"])
  const ram = definitions.find((definition) => definition.code === LIBRARY_RAM)?.code
  const phoneFilters = [byLabel(["цвет"]), storage, byLabel(["диагональ"]), byLabel(["количество ядер процессора"]), byLabel(["сканер отпечатка пальца"])].filter((code): code is string => Boolean(code))
  const sourceCodes = new Set((await service.listCatalogRecords({}, { take: 10000 })).flatMap((record) => record.attributes.filter((attribute) => !attribute.cmsManaged).map((attribute) => attribute.key)))
  for (const definition of definitions) if (sourceCodes.has(definition.code) || definition.code === "variant_color") {
    const label = normalizeCatalogValue(definition.label)
    const role = /^(цвет|цвет варианта)$/.test(label) ? "color" as const : definition.code === storage ? "variant_axis" as const : "spec" as const
    await service.updateCatalogDefinitions({ id: definition.id, role, filter_control: role === "color" ? "swatch" : "checkbox" })
  }
  const profile = await service.createCatalogProfiles({ key: "store", scope: "texno", region_id: region.id, product_types: [{ code: "phone", label: "Телефоны", enabled: true, variant_axes: [color, storage, ram].filter((code): code is string => Boolean(code)), filter_codes: phoneFilters }, { code: "accessory", label: "Аксессуары", enabled: true, variant_axes: color ? [color] : [], filter_codes: phoneFilters.slice(0, 1) }] })
  console.log(JSON.stringify({ profile: profile.id, currency_code: region.currency_code, types: profile.product_types.map((type) => type.code) }))
}
