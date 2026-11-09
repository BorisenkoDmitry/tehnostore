import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import InsalesImportModuleService from "../modules/insales-import/service"
import { INSALES_IMPORT_MODULE } from "../modules/insales-import"
import { classifyInsalesChange, insalesJobLock, parseAdminInsalesUpload, publicImportJob } from "../lib/insales-admin"
import { publicDryRunReport } from "../lib/insales"

type Input = { actor_id: string; filename?: string; source_base64?: string; id?: string; action?: "queue" | "resume" | "cancel" }
type Compensation = { created?: string; previous?: { id: string; status: "preview" | "queued" | "running" | "completed" | "review" | "failed" | "cancelled"; error: string | null } }

const saveImportJobStep = createStep<Input, Record<string, unknown>, Compensation>("save-insales-import-job", async (input, { container }) => {
  const service = container.resolve<InsalesImportModuleService>(INSALES_IMPORT_MODULE)
  if (!input.id) {
    const plan = parseAdminInsalesUpload(input.source_base64!)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: products } = await query.graph({ entity: "product", fields: ["id", "title", "status", "metadata"], pagination: { take: 10000 } })
    const existing = new Map(products.filter((product) => product.metadata?.insales_product_id).map((product) => [String(product.metadata!.insales_product_id), product]))
    const changes: Record<string, unknown>[] = []
    for (const product of plan.products) {
      const current = existing.get(product.sourceProductId)
      const classification = await classifyInsalesChange(container, product, current)
      changes.push({ source_product_id: product.sourceProductId, title: product.title, product_id: current?.id, action: classification.action, ...(classification.action === "conflict" ? { reason: classification.reason, error: classification.reason } : {}), manual_override: current?.metadata?.catalog_manual_override === true })
    }
    const report = { ...publicDryRunReport(plan), changes, mapping: { "ID товара": "source_product_id", "ID варианта": "source_variant_id", "Название товара или услуги": "title", "Цена продажи": "price RUB", "Остаток": "stock (blank = unknown)", "Размещение на сайте": "approved category allowlist", "Параметр: *": "typed catalog attributes" } }
    const job = await service.createInsalesImportJobs({ filename: pathSafeName(input.filename!), source_sha256: plan.sourceSha256, actor_id: input.actor_id, status: "preview", report, progress: { processed: 0, total: plan.products.length, entries: [] } })
    try { await service.createInsalesImportPayloads({ job: job.id, source_base64: input.source_base64! }) } catch (error) { await service.deleteInsalesImportJobs(job.id); throw error }
    return new StepResponse(publicImportJob(job as unknown as Record<string, unknown>), { created: job.id })
  }
  const id = input.id
  const transition = await container.resolve(Modules.LOCKING).execute(insalesJobLock(id), async () => {
    const job = await service.retrieveInsalesImportJob(id)
    if (job.status === "running") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The job is running. Wait until the current batch finishes.")
    if (input.action === "queue" && job.status !== "preview") throw new MedusaError(MedusaError.Types.INVALID_DATA, "Only a preview can be queued")
    if (input.action === "resume" && !["failed", "review"].includes(job.status)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Only failed/review jobs can resume")
    if (input.action === "cancel" && !["preview", "queued", "failed", "review"].includes(job.status)) throw new MedusaError(MedusaError.Types.INVALID_DATA, "This job cannot be cancelled")
    const next = await service.updateInsalesImportJobs({ id: job.id, status: input.action === "cancel" ? "cancelled" : "queued", error: null })
    return { job: next, previous: { id: job.id, status: job.status, error: job.error } }
  }, { timeout: 5, expire: 60 })
  return new StepResponse(publicImportJob(transition.job as unknown as Record<string, unknown>), { previous: transition.previous })
}, async (data, { container }) => {
  if (!data) return
  const service = container.resolve<InsalesImportModuleService>(INSALES_IMPORT_MODULE)
  if (data.created) {
    const sources = await service.listInsalesImportPayloads({ job_id: data.created }, { select: ["id"] })
    if (sources.length) await service.deleteInsalesImportPayloads(sources.map((source) => source.id))
    await service.deleteInsalesImportJobs(data.created)
  }
  if (data.previous) await service.updateInsalesImportJobs(data.previous)
})

function pathSafeName(name: string) { return name.replace(/^.*[\\/]/, "").replace(/[\u0000-\u001f]/g, "").slice(0, 200) }

export const saveInsalesImportJobWorkflow = createWorkflow({ name: "save-insales-import-job", store: false }, function (input: Input) {
  return new WorkflowResponse(saveImportJobStep(input))
})
