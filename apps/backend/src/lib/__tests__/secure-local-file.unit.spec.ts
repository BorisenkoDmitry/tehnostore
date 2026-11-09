import SecureLocalFileService, { isPublicImage, resolvePrivateFilePath } from "../../modules/secure-local-file/service"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

describe("F7 file privacy", () => {
  it("defaults outside the Medusa development watcher tree", () => {
    const previous = process.env.PRIVATE_UPLOAD_DIR
    delete process.env.PRIVATE_UPLOAD_DIR
    try {
      expect(resolvePrivateFilePath("private-probe.csv")).toBe(path.resolve(process.cwd(), "../private-files/private-probe.csv"))
    } finally {
      if (previous === undefined) delete process.env.PRIVATE_UPLOAD_DIR
      else process.env.PRIVATE_UPLOAD_DIR = previous
    }
  })
  it.each(["private-123.csv", "dir/private-123.csv"])("resolves a private key %s", (key) => {
    expect(resolvePrivateFilePath(key, "/private-files")).toBe(path.resolve("/private-files", key))
  })
  it.each(["../private-x.csv", "/private-x.csv", "dir/../../private-x.csv", "..\\private-x.csv", "public.csv", "private-\0.csv"])("rejects escaping/nonprivate key %j", (key) => {
    expect(() => resolvePrivateFilePath(key, "/private-files")).toThrow()
  })
  it.each([["x.html", "text/html"], ["x.svg", "image/svg+xml"], ["x.png", "text/html"], ["x.csv", "text/csv"]])("does not publish %s (%s)", (file, mime) => {
    expect(isPublicImage(file, mime)).toBe(false)
  })
  it("preserves genuine raster uploads", () => expect(isPublicImage("x.png", "image/png")).toBe(true))
  it("stores private exports outside public media and returns an authenticated download", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cms-file-test-"))
    try {
      const provider = new SecureLocalFileService({}, { upload_dir: path.join(dir, "static"), private_upload_dir: path.join(dir, "private"), backend_url: "http://remediation.localhost/static" })
      const file = await provider.upload({ filename: "export.csv", mimeType: "text/csv", content: "SKU,PRICE\nSYNTHETIC,10", access: "private" })
      expect(await readFile(path.join(dir, "private", file.key), "utf8")).toContain("SYNTHETIC")
      expect(file.url).toContain("/admin/private-files?key=private-")
      expect(await provider.getPresignedDownloadUrl({ fileKey: file.key })).toBe(file.url)
      expect((await provider.getAsBuffer({ fileKey: file.key })).toString()).toContain("SYNTHETIC")
      await provider.delete({ fileKey: file.key })
      await expect(readFile(path.join(dir, "private", file.key))).rejects.toThrow()
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
