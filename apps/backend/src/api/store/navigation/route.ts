import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { NAVIGATION_MODULE } from "../../../modules/navigation"
import NavigationModuleService from "../../../modules/navigation/service"
import { NavigationInput } from "../../admin/navigation/validators"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<NavigationModuleService>(NAVIGATION_MODULE)
  const [navigation] = await service.listSiteNavigations({ key: "main" })
  res.setHeader("Cache-Control", "no-store")
  res.json({ navigation: navigation ? {
    items: (navigation.items as NavigationInput["items"]).filter((item) => item.visible).map((item) => {
      const nodes = item.children ?? []
      const index = new Map(nodes.map((node) => [node.id, node]))
      return { ...item, children: nodes.filter((node) => {
        if (!node.visible) return false
        const visited = new Set([node.id])
        let parent = node.parent_id
        while (parent !== null) {
          const ancestor = index.get(parent)
          if (!ancestor?.visible || visited.has(parent)) return false
          visited.add(parent)
          parent = ancestor.parent_id
        }
        return true
      }) }
    }),
    phone: navigation.phone,
    telegram_url: navigation.telegram_url,
  } : null })
}
