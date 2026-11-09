import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { NAVIGATION_MODULE } from "../../../modules/navigation"
import NavigationModuleService from "../../../modules/navigation/service"
import { NavigationInput } from "../../admin/navigation/validators"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getCatalogProfile } from "../../../lib/catalog-cms"
import { publishedCategoryIds, resolveCategoryNavigation } from "../../../lib/catalog-hierarchy"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<NavigationModuleService>(NAVIGATION_MODULE)
  const profile = await getCatalogProfile(req.scope)
  const [navigation] = await service.listSiteNavigations({ key: "main" })
  const { data: categories } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_category", fields: ["id", "handle", "parent_category_id", "metadata", "is_active", "is_internal"], pagination: { take: 1000 } })
  const publishedIds = publishedCategoryIds(categories, profile.scope)
  const published = new Map(categories.filter((category) => publishedIds.has(category.id)).map((category) => [category.id, category]))
  res.setHeader("Cache-Control", "no-store")
  res.json({ navigation: navigation ? {
    items: resolveCategoryNavigation(navigation.items as NavigationInput["items"], categories).filter((item) => item.visible).map((item) => {
      const nodes = (item.children ?? []).map((node) => ({ ...node, visible: node.visible && (!node.category_id || published.has(node.category_id)), href: node.category_id && published.has(node.category_id) ? `/collection/${published.get(node.category_id)!.handle}` : node.href }))
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
