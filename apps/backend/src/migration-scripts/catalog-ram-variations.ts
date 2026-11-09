import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateProductsStep } from "@medusajs/medusa/core-flows"
import { catalogKind } from "../lib/catalog-cms"
import { catalogScopes, CATALOG_STRUCTURE_LOCK, invalidCatalog } from "../lib/catalog-constructor"
import { attachRamChoices, LIBRARY_RAM, LIBRARY_VARIATIONS, libraryVariations } from "../lib/catalog-variation-library"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import type CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import type { CatalogAttributeInput } from "../modules/catalog-attributes/types"

const updateRamAssignments = createWorkflow("update-ram-assignments", function (input: {
  products: { id: string; metadata: Record<string, unknown> }[]
}) {
  return new WorkflowResponse(updateProductsStep(input))
})

type Product = {
  id: string
  metadata: Record<string, unknown>
  catalog_record?: { attributes?: CatalogAttributeInput[] }
  variants: { id: string; catalog_variant?: { attributes?: CatalogAttributeInput[] } }[]
}

export default async function catalogRamVariations({ container }: ExecArgs) {
  const service = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const dryRun = process.env.CATALOG_RAM_DRY_RUN === "1"
  await container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
    const [profile] = await service.listCatalogProfiles({ key: "store" })
    const [definition] = await service.listCatalogDefinitions({ code: LIBRARY_RAM })
    const choices = new Set(definition?.choice_values ?? [])
    const applicableTypes = new Set<unknown>(["phone"])
    const updates: { id: string; before: Product["metadata"]; metadata: Product["metadata"] }[] = []
    let assigned = 0
    if (profile) for (let skip = 0; ; skip += 200) {
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "metadata", "catalog_record.attributes", "variants.id", "variants.catalog_variant.attributes"],
        pagination: { take: 200, skip, order: { id: "ASC" } },
      })
      for (const product of data as unknown as Product[]) {
        if (!catalogScopes(profile.scope).includes(String(product.metadata?.catalog_scope))) continue
        const planned = attachRamChoices(product.metadata, product.catalog_record?.attributes,
          product.variants.map((variant) => ({ id: variant.id, attributes: variant.catalog_variant?.attributes })))
        const assignments = Object.values(planned ?? libraryVariations(product.metadata) ?? {}).flatMap((row) => row[LIBRARY_RAM]?.choice ?? [])
        if (assignments.length) applicableTypes.add(catalogKind(product.metadata))
        for (const value of assignments) choices.add(value)
        assigned += assignments.length
        if (planned) updates.push({ id: product.id, before: product.metadata, metadata: { ...product.metadata, [LIBRARY_VARIATIONS]: planned } })
      }
      if (data.length < 200) break
    }
    const choiceValues = [...choices].sort((a, b) => a.localeCompare(b, "ru", { numeric: true }))
    const types = profile?.product_types.map((type) => applicableTypes.has(type.code) && !type.variant_axes.includes(LIBRARY_RAM)
      ? { ...type, variant_axes: [...type.variant_axes, LIBRARY_RAM] } : type)
    if (types?.some((type) => type.variant_axes.length > 10)) throw invalidCatalog("Освободите место для ОЗУ в шаблоне вариаций")
    if (!dryRun) {
      let createdDefinition: string | undefined
      let changedDefinition = false
      let changedProfile = false
      const applied: typeof updates = []
      try {
        if (!definition) {
          const created = await service.createCatalogDefinitions({ code: LIBRARY_RAM, label: "Оперативная память", type: "number",
            unit: "ГБ", role: "variant_axis", position: 126, choice_values: choiceValues })
          createdDefinition = created.id
        } else if (choiceValues.length !== definition.choice_values.length) {
          await service.updateCatalogDefinitions({ id: definition.id, choice_values: choiceValues })
          changedDefinition = true
        }
        if (profile && types && JSON.stringify(profile.product_types) !== JSON.stringify(types)) {
          await service.updateCatalogProfiles({ id: profile.id, product_types: types })
          changedProfile = true
        }
        for (let index = 0; index < updates.length; index += 100) {
          const batch = updates.slice(index, index + 100)
          await updateRamAssignments(container).run({ input: { products: batch.map(({ id, metadata }) => ({ id, metadata })) } })
          applied.push(...batch)
        }
      } catch (error) {
        for (let index = 0; index < applied.length; index += 100) {
          await updateRamAssignments(container).run({ input: { products: applied.slice(index, index + 100).map(({ id, before }) => ({
            id, metadata: { ...before, [LIBRARY_VARIATIONS]: before[LIBRARY_VARIATIONS] ?? null },
          })) } })
        }
        if (profile && changedProfile) await service.updateCatalogProfiles({ id: profile.id, product_types: profile.product_types })
        if (definition && changedDefinition) await service.updateCatalogDefinitions({ id: definition.id, choice_values: definition.choice_values })
        if (createdDefinition) await service.deleteCatalogDefinitions(createdDefinition)
        throw error
      }
    }
    console.log(JSON.stringify({ dryRun, productsToUpdate: updates.length, assigned, values: choiceValues }))
  }, { timeout: 10, expire: 900 })
}
