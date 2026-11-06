import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { NAVIGATION_MODULE } from "../../modules/navigation"
import NavigationModuleService from "../../modules/navigation/service"
import { NavigationInput, UpdateNavigationSchema } from "../../api/admin/navigation/validators"

type Snapshot = NavigationInput & { id: string }

export const saveNavigationStep = createStep(
  "save-navigation",
  async (input: NavigationInput, { container }) => {
    const data = UpdateNavigationSchema.parse(input)
    const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
    const [previous] = await service.listSiteNavigations({ key: "main" })
    const navigation = previous
      ? await service.updateSiteNavigations({ id: previous.id, ...data })
      : await service.createSiteNavigations({ key: "main", ...data })

    const snapshot: Snapshot | null = previous ? {
      id: previous.id,
      items: previous.items as NavigationInput["items"],
      phone: previous.phone,
      telegram_url: previous.telegram_url,
    } : null

    return new StepResponse(navigation, { id: navigation.id, previous: snapshot })
  },
  async (snapshot, { container }) => {
    if (!snapshot) return
    const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
    if (snapshot.previous) {
      await service.updateSiteNavigations(snapshot.previous)
    } else {
      await service.deleteSiteNavigations(snapshot.id)
    }
  }
)
