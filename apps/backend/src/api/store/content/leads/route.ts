import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { contentWorkflow } from "../../../../workflows/content"
import type { ContentLeadInputType } from "../../../../modules/content/validation"
export async function POST(req: MedusaRequest<ContentLeadInputType>, res: MedusaResponse) {
  const { result } = await contentWorkflow(req.scope).run({ input: { operation: "lead-create", data: req.validatedBody } })
  res.setHeader("Cache-Control", "no-store")
  res.status(201).json(result)
}
