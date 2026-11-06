import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { NAVIGATION_MODULE } from "../modules/navigation"
import NavigationModuleService from "../modules/navigation/service"
import { saveNavigationWorkflow } from "../workflows/save-navigation"
import catalogNodes from "./data/catalog-navigation.json"

export default async function seedNavigation({ container }: ExecArgs) {
  const service = container.resolve<NavigationModuleService>(NAVIGATION_MODULE)
  const [existing] = await service.listSiteNavigations({ key: "main" })
  if (existing) return
  await saveNavigationWorkflow(container).run({ input: {
    items: [
      { id: "catalog", label: "Каталог", kind: "catalog", href: "", visible: true, children: catalogNodes },
      { id: "about", label: "О компании", kind: "link", href: "/page/about-us", visible: true },
      { id: "delivery", label: "Доставка", kind: "link", href: "/page/delivery", visible: true },
      { id: "warranty", label: "Гарантия", kind: "link", href: "/page/warranty", visible: true },
      { id: "contacts", label: "Контакты", kind: "link", href: "/page/contacts", visible: true },
      { id: "reviews", label: "Отзывы", kind: "link", href: "/page/reviews", visible: true },
      { id: "faq", label: "FAQ", kind: "link", href: "/page/faq", visible: true },
    ],
    phone: "+7 (495) 104-59-90",
    telegram_url: "https://t.me/Texno_Salle",
  } })
  container.resolve(ContainerRegistrationKeys.LOGGER).info("TEXNO STORE navigation initialized")
}
