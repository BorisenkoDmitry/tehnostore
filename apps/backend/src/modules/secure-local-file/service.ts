import { LocalFileService } from "@medusajs/medusa/file-local"
import type { FileTypes, LocalFileServiceOptions } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import path from "node:path"
import { access } from "node:fs/promises"
import { createReadStream } from "node:fs"
import { readFile } from "node:fs/promises"

const imageTypes: Record<string, string[]> = {
  ".png": ["image/png"], ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"],
  ".gif": ["image/gif"], ".webp": ["image/webp"], ".avif": ["image/avif"],
  ".ico": ["image/x-icon", "image/vnd.microsoft.icon"],
}

export function isPublicImage(filename: string, mimeType?: string) {
  return !!imageTypes[path.extname(filename).toLowerCase()]?.includes(mimeType || "")
}

export function validatePublicUpload(filename: string, mimeType?: string) {
  if (!isPublicImage(filename, mimeType)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Public uploads must be raster images")
  }
}

export function isPrivateFileKey(key: string) {
  return path.posix.basename(key.replace(/\\/g, "/")).startsWith("private-")
}

function validateFilename(filename: string) {
  if (!filename || filename.includes("\0") || /[/\\]/.test(filename) || filename === "." || filename === "..") {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Filename must not contain a directory")
  }
}

export function resolvePrivateFilePath(key: string, baseDir = process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), "..", "private-files")) {
  if (!key || key.includes("\0") || key.includes("\\") || !isPrivateFileKey(key)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid private file key")
  }
  const resolvedBase = path.resolve(baseDir)
  const resolved = path.resolve(resolvedBase, key)
  const relative = path.relative(resolvedBase, resolved)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid private file key")
  }
  return resolved
}

// Preserve localfs_local, the provider identifier stored on existing file rows.
export default class SecureLocalFileService extends LocalFileService {
  static identifier = "localfs"

  constructor(container: Record<string, unknown>, options: LocalFileServiceOptions) {
    super(container, {
      ...options,
      // Medusa develop watches the app directory and restarts on document
      // writes. Keep the default outside that tree, as well as outside static.
      private_upload_dir: options?.private_upload_dir || process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), "..", "private-files"),
    })
  }

  private privateUrl(key: string) {
    const url = new URL(this.backendUrl_)
    url.pathname = "/admin/private-files"
    url.search = new URLSearchParams({ key }).toString()
    return url.href
  }

  async upload(file: FileTypes.ProviderUploadFileDTO) {
    validateFilename(file?.filename)
    if (file?.access === "public") validatePublicUpload(file.filename, file.mimeType)
    const result = await super.upload(file)
    return isPrivateFileKey(result.key) ? { ...result, url: this.privateUrl(result.key) } : result
  }

  async getUploadStream(file: FileTypes.ProviderUploadStreamDTO) {
    validateFilename(file.filename)
    if (file.access === "public") validatePublicUpload(file.filename, file.mimeType)
    const result = await super.getUploadStream(file)
    if (!isPrivateFileKey(result.fileKey)) return result
    return {
      ...result,
      url: this.privateUrl(result.fileKey),
      promise: result.promise.then((saved) => ({ ...saved, url: this.privateUrl(saved.key) })),
    }
  }

  async getPresignedDownloadUrl(file: FileTypes.ProviderGetFileDTO) {
    if (!isPrivateFileKey(file.fileKey)) return super.getPresignedDownloadUrl(file)
    // The URL is deliberately not a bearer capability. Every download runs
    // native Admin authentication and checks the current staff record.
    await this.privatePath(file.fileKey)
    return this.privateUrl(file.fileKey)
  }

  private async privatePath(key: string) {
    const filePath = resolvePrivateFilePath(key, this.privateUploadDir_)
    try { await access(filePath); return filePath } catch {
      const legacy = resolvePrivateFilePath(key, this.uploadDir_)
      await access(legacy)
      return legacy
    }
  }

  async getAsBuffer(file: FileTypes.ProviderGetFileDTO) {
    return isPrivateFileKey(file.fileKey) ? readFile(await this.privatePath(file.fileKey)) : super.getAsBuffer(file)
  }

  async getDownloadStream(file: FileTypes.ProviderGetFileDTO) {
    return isPrivateFileKey(file.fileKey) ? createReadStream(await this.privatePath(file.fileKey)) : super.getDownloadStream(file)
  }
}
