import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { NAVIGATION_MODULE } from "../../../modules/navigation"
import NavigationModuleService from "../../../modules/navigation/service"
import { saveNavigationWorkflow } from "../../../workflows/save-navigation"
import { NavigationInput } from "./validators"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { resolveCategoryNavigation } from "../../../lib/catalog-hierarchy"
import type { NavigationItem } from "../../../modules/navigation/types"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<NavigationModuleService>(NAVIGATION_MODULE)
  const [navigation] = await service.listSiteNavigations({ key: "main" })
  const { data: categories } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "product_category", fields: ["id", "handle", "parent_category_id", "metadata", "is_active", "is_internal"], pagination: { take: 1000 } })
  res.json({ navigation: navigation ? { ...navigation, items: resolveCategoryNavigation(navigation.items as NavigationItem[], categories) } : null })
}

export async function POST(req: AuthenticatedMedusaRequest<NavigationInput>, res: MedusaResponse) {
  const { result } = await saveNavigationWorkflow(req.scope).run({ input: req.validatedBody })
  res.json(result)
}
