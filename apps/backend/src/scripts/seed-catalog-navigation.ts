import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { NAVIGATION_MODULE } from "../modules/navigation"
import NavigationModuleService from "../modules/navigation/service"
import { saveNavigationWorkflow } from "../workflows/save-navigation"
import { NavigationInput } from "../api/admin/navigation/validators"
import catalogNodes from "./data/catalog-navigation.json"

export default async function seedCatalogNavigation({ container }: ExecArgs) {
  const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
  const [navigation] = await service.listSiteNavigations({ key: "main" })
  if (!navigation) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Initialize the main navigation first")
  const items = navigation.items as NavigationInput["items"]
  const catalog = items.find((item) => item.kind === "catalog")
  if (!catalog) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Add the catalog menu item first")
  if (catalog.children?.length) return
  await saveNavigationWorkflow(container).run({ input: {
    items: items.map((item) => item.id === catalog.id ? { ...item, children: catalogNodes } : item),
    phone: navigation.phone,
    telegram_url: navigation.telegram_url,
  } })
  container.resolve(ContainerRegistrationKeys.LOGGER).info(`Imported ${catalogNodes.length} catalog navigation entries`)
}
