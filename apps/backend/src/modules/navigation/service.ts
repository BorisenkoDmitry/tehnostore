import { MedusaService } from "@medusajs/framework/utils"
import SiteNavigation from "./models/site-navigation"

class NavigationModuleService extends MedusaService({ SiteNavigation }) {}

export default NavigationModuleService
