import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/** Merchant payloads are runtime inputs, not dependencies of a portable build. */
export function readSeedData<T>(file: string): T {
  const directory = process.env.CMS_SEED_DATA_DIRECTORY || resolve(process.cwd(), "src/scripts/data")
  try {
    return JSON.parse(readFileSync(resolve(directory, file), "utf8").replace(/^\uFEFF/, "")) as T
  } catch {
    throw new Error(`Cannot load seed input ${file}. Set CMS_SEED_DATA_DIRECTORY to an explicit merchant seed directory before running this optional script.`)
  }
}
