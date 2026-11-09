import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"
import { isPublicImage } from "../../../modules/secure-local-file/service"

// Keep native multipart parsing/authorization. CSV imports and other documents
// are private; only raster assets are published on the application origin.
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const files = (req as AuthenticatedMedusaRequest & { files?: { originalname: string; mimetype: string; buffer: Buffer }[] }).files
  if (!files?.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "No files were uploaded")
  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer.toString("base64"),
        access: isPublicImage(file.originalname, file.mimetype) ? "public" : "private",
      })),
    },
  })
  res.status(200).json({ files: result })
}
