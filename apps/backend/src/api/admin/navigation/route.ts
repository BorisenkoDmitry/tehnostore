import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { NAVIGATION_MODULE } from "../../../modules/navigation"
import NavigationModuleService from "../../../modules/navigation/service"
import { saveNavigationWorkflow } from "../../../workflows/save-navigation"
import { NavigationInput } from "./validators"

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const service = req.scope.resolve<NavigationModuleService>(NAVIGATION_MODULE)
  const [navigation] = await service.listSiteNavigations({ key: "main" })
  res.json({ navigation: navigation ?? null })
}

export async function POST(req: AuthenticatedMedusaRequest<NavigationInput>, res: MedusaResponse) {
  const { result } = await saveNavigationWorkflow(req.scope).run({ input: req.validatedBody })
  res.json(result)
}
