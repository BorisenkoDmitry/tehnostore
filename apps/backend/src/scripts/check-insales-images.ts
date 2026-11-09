import { writeFileSync } from "node:fs"
import path from "node:path"
import { loadInsalesPlan } from "../lib/insales"

/** HEAD only, fixed public CDN; redirects are never followed to another host. */
export default async function checkInsalesImages() {
  const plan = loadInsalesPlan({ sourcePath: process.env.INSALES_CSV || "/tmp/insales-source.csv", navigationPath: path.join(__dirname, "data/catalog-navigation.json") })
  const urls = [...new Set(plan.products.flatMap((p) => [...p.imageUrls, ...p.variants.flatMap((v) => v.imageUrls)]))]
  const results: { url: string; status: number | null; content_type: string | null; error?: string }[] = []
  let cursor = 0
  async function worker() {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      const parsed = new URL(url)
      if (parsed.protocol !== "https:" || parsed.hostname !== "cdn.insales-shop.ru") throw new Error("Image URL outside allowlist")
      try {
        const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(15000) })
        results.push({ url, status: response.status, content_type: response.headers.get("content-type") })
      } catch (error) { results.push({ url, status: null, content_type: null, error: String(error) }) }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker))
  const report = { checked_at: new Date().toISOString(), method: "HEAD", redirected: false, source_sha256: plan.sourceSha256, total: urls.length, reachable_images: results.filter((r) => r.status === 200 && r.content_type?.startsWith("image/")).length, status_counts: results.reduce<Record<string, number>>((a, r) => { const key = String(r.status ?? "network_error"); a[key] = (a[key] ?? 0) + 1; return a }, {}), results }
  writeFileSync(process.env.INSALES_IMAGE_REPORT || "/tmp/insales-image-check.json", JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ total: report.total, reachable_images: report.reachable_images, status_counts: report.status_counts }))
}
