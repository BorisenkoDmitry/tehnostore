import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { updateProductCategoriesWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import type { CatalogTrashBody } from "../api/admin/catalog-constructor/validators"
import { getCatalogProfile } from "../lib/catalog-cms"
import { CATALOG_STRUCTURE_LOCK, catalogScopes, catalogTrashScope } from "../lib/catalog-constructor"

type TrashSnapshot = {
  scope: string | null
  manual_override: boolean | null
  status?: "draft" | "proposed" | "published" | "rejected"
  active?: boolean
  internal?: boolean
}

const changeCatalogTrash = createStep("change-catalog-trash", async (input: CatalogTrashBody, { container }) => {
  await container.resolve(Modules.LOCKING).execute(CATALOG_STRUCTURE_LOCK, async () => {
    const profile = await getCatalogProfile(container)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const folder = input.kind === "folder"
    const { data: [row] } = folder
      ? await query.graph({ entity: "product_category", fields: ["id", "metadata", "is_active", "is_internal"], filters: { id: input.id } })
      : await query.graph({ entity: "product", fields: ["id", "metadata", "status"], filters: { id: input.id } })
    if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Карточка каталога не найдена")

    const metadata = row.metadata ?? {}
    const snapshot = metadata.catalog_trash as TrashSnapshot | undefined
    const restoring = input.action === "restore"
    if (restoring && !snapshot) return
    if (snapshot && metadata.catalog_scope !== catalogTrashScope(profile.scope)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Карточка из другого каталога")
    if (snapshot && !restoring) return
    if (!restoring && (folder || metadata.catalog_scope) && !catalogScopes(profile.scope).includes(String(metadata.catalog_scope))) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Карточка из другого каталога")
    }

    const previous: TrashSnapshot = {
      scope: typeof metadata.catalog_scope === "string" ? metadata.catalog_scope : null,
      manual_override: typeof metadata.catalog_manual_override === "boolean" ? metadata.catalog_manual_override : null,
      ...("status" in row ? { status: row.status } : { active: row.is_active, internal: row.is_internal }),
    }
    const nextMetadata = restoring
      ? { ...metadata, catalog_scope: snapshot!.scope, catalog_manual_override: snapshot!.manual_override, catalog_trash: null }
      : { ...metadata, catalog_scope: catalogTrashScope(profile.scope), catalog_manual_override: true, catalog_trash: previous }
    if (folder) {
      await updateProductCategoriesWorkflow(container).run({ input: { selector: { id: input.id }, update: {
        metadata: nextMetadata, is_active: restoring ? snapshot!.active : false, is_internal: restoring ? snapshot!.internal : true,
      } } })
    } else {
      await updateProductsWorkflow(container).run({ input: { products: [{
        id: input.id, metadata: nextMetadata, status: restoring ? snapshot!.status : "draft",
      }] } })
    }
  }, { timeout: 10, expire: 60 })
  return new StepResponse({ id: input.id })
})

export const changeCatalogTrashWorkflow = createWorkflow("change-catalog-trash", function (input: CatalogTrashBody) {
  return new WorkflowResponse(changeCatalogTrash(input))
})
