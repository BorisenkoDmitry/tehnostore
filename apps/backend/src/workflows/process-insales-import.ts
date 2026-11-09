import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { INSALES_IMPORT_MODULE } from "../modules/insales-import"
import InsalesImportModuleService from "../modules/insales-import/service"
import { CATALOG_ATTRIBUTES_MODULE } from "../modules/catalog-attributes"
import CatalogAttributesModuleService from "../modules/catalog-attributes/service"
import { describeInsalesError, insalesJobLock, parseAdminInsalesUpload } from "../lib/insales-admin"
import { runInsalesImport } from "../scripts/import-insales"

type JournalEntry = { source_product_id: string; product_id?: string; status: string; error?: string }

const processInsalesImportStep = createStep("process-insales-import", async (_input: Record<string, never>, { container }) => {
  const locking = container.resolve(Modules.LOCKING)
  const result = await locking.execute("texno-insales-background-import", async (signal) => {
    const service = container.resolve<InsalesImportModuleService>(INSALES_IMPORT_MODULE)
    const interrupted = await service.listInsalesImportJobs({ status: "running" }, { take: 10 })
    for (const item of interrupted) {
      if (Date.now() - new Date(item.updated_at).getTime() > 30 * 60 * 1000) await service.updateInsalesImportJobs({ id: item.id, status: "failed", error: "Worker interrupted; resume safely from the product journal" })
    }
    const jobs = await service.listInsalesImportJobs({ status: "queued" }, { take: 1, order: { created_at: "ASC" } })
    const next = jobs[0]
    if (!next) return { processed: false }
    const job = await locking.execute(insalesJobLock(next.id), async () => {
      const latest = await service.retrieveInsalesImportJob(next.id)
      return latest.status === "queued" ? service.updateInsalesImportJobs({ id: latest.id, status: "running", error: null }) : null
    }, { timeout: 5, expire: 60 })
    if (!job) return { processed: false }
    try {
      const payloads = await service.listInsalesImportPayloads({ job_id: job.id }, { take: 1, select: ["id", "source_base64"] })
      const payload = payloads[0]
      if (!payload) throw new Error("Private import source is unavailable")
      const plan = parseAdminInsalesUpload(payload.source_base64)
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      // A per-run recovery snapshot is private and taken before any commerce write.
      // Catalog private provenance stays in this protected job record only.
      if (!job.has_backup) {
        const sourceIds = new Set(plan.products.map((product) => product.sourceProductId))
        const { data: mapped } = await query.graph({ entity: "product", fields: ["id", "metadata"], pagination: { take: 10000 } })
        const affected = mapped.filter((product) => sourceIds.has(String(product.metadata?.insales_product_id ?? product.metadata?.catalog_source_id ?? "")))
        const products: unknown[] = []
        const records: unknown[] = []
        const catalog = container.resolve<CatalogAttributesModuleService>(CATALOG_ATTRIBUTES_MODULE)
        for (let offset = 0; offset < affected.length; offset += 40) {
          signal?.throwIfAborted()
          const batch = affected.slice(offset, offset + 40)
          const ids = batch.map((product) => product.id)
          const sourceBatch = batch.map((product) => String(product.metadata?.insales_product_id ?? product.metadata?.catalog_source_id))
          const { data } = await query.graph({ entity: "product", filters: { id: ids }, fields: ["*", "variants.*", "variants.price_set.*", "variants.price_set.prices.*", "variants.inventory_items.*", "variants.inventory_items.inventory.*", "variants.inventory_items.inventory.location_levels.*", "options.*", "options.values.*", "images.*", "categories.*", "sales_channels.*"] })
          products.push(...data)
          records.push(...await catalog.listCatalogRecords({ source_product_id: sourceBatch }, { take: sourceBatch.length, relations: ["variants", "attribute_values"] }))
        }
        await service.updateInsalesImportPayloads({ id: payload.id, backup: { taken_at: new Date().toISOString(), source_sha256: plan.sourceSha256, products, catalog_records: records, expected_source_ids: [...sourceIds], recovery: "Per-product compensating workflows; completed rows retained. Review snapshot before operator recovery. Never restore over later orders." } as unknown as Record<string, unknown> })
        await service.updateInsalesImportJobs({ id: job.id, has_backup: true })
      }
      signal?.throwIfAborted()
      const entries = (Array.isArray(job.progress.entries) ? job.progress.entries : []) as JournalEntry[]
      const successful = entries.filter((entry) => ["completed", "unchanged"].includes(entry.status)).map((entry) => entry.source_product_id)
      const report = await runInsalesImport(container, {
        plan, apply: true, backupVerified: true, completedSourceIds: successful, signal,
        reportPath: `/tmp/${job.id}-report.json`, journalPath: `/tmp/${job.id}-journal.jsonl`,
        onProgress: async (entry) => {
          const previous = entries.findIndex((item) => item.source_product_id === entry.source_product_id)
          if (previous >= 0) entries[previous] = entry
          else entries.push(entry)
          // Source hash is committed by the product workflow itself. A crash
          // between journal checkpoints still replays as an unchanged product.
          if (entries.length % 20 === 0 || entry.status === "failed" || entries.length === plan.products.length) await service.updateInsalesImportJobs({ id: job.id, progress: { processed: entries.length, total: plan.products.length, entries } })
        },
      })
      const hasConflicts = entries.some((entry) => entry.status === "conflict")
      await service.updateInsalesImportJobs({ id: job.id, status: hasConflicts ? "review" : "completed", progress: { processed: entries.length, total: plan.products.length, entries }, report: { ...job.report, ...report } as unknown as Record<string, unknown> })
      return { processed: true, id: job.id }
    } catch (error) {
      await service.updateInsalesImportJobs({ id: job.id, status: "failed", error: describeInsalesError(error) })
      return { processed: true, id: job.id, failed: true }
    }
  }, { timeout: 5, expire: 60 })
  return new StepResponse(result)
})

export const processInsalesImportWorkflow = createWorkflow("process-insales-import", function (input: Record<string, never>) {
  return new WorkflowResponse(processInsalesImportStep(input))
})
