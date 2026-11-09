import { parseAdminInsalesUpload, publicImportJob } from "../insales-admin"

describe("Admin InSales upload privacy and validation", () => {
  it("never exposes original upload or private recovery snapshot", () => {
    const result = publicImportJob({ id: "insjob_test", status: "preview", source_base64: "private source costs", backup: { products: [{ private_cost: 123 }] }, report: { summary: { importedProducts: 1 } } })
    expect(result.id).toBe("insjob_test")
    expect(result.backup_available).toBe(true)
    expect(result).not.toHaveProperty("source_base64")
    expect(result).not.toHaveProperty("backup")
    expect(JSON.stringify(result)).not.toContain("private_cost")
  })

  it.each(["", "not base64", "YQ", "YQ==\n"])("rejects empty or noncanonical uploads %s", (value) => {
    expect(() => parseAdminInsalesUpload(value)).toThrow("canonical base64")
  })

  it("requires the original UTF-16LE BOM rather than guessing the encoding", () => {
    expect(() => parseAdminInsalesUpload(Buffer.from("ID товара\tID варианта", "utf8").toString("base64"))).toThrow("UTF-16LE")
  })

  it("validates the required InSales headers before creating a job", () => {
    expect(() => parseAdminInsalesUpload(Buffer.from("\ufeffwrong\theader\n1\t2", "utf16le").toString("base64"))).toThrow("Missing source column")
  })
})
