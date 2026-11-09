import { useRegionPermissions } from "@medusajs/dashboard/hooks"
import { Container, Heading, Tabs, Text } from "@medusajs/ui"
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"

export function CartSettings({ section, children }: { section: "delivery" | "services"; children: ReactNode }) {
  const navigate = useNavigate()
  const { canRead } = useRegionPermissions()

  return <Tabs value={section} onValueChange={(value) => navigate(`/storefront/cart/${value}`)} activationMode="manual">
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading>Корзина покупателя</Heading>
        <Text size="small" className="text-ui-fg-subtle">Настройки, которые покупатель видит при оформлении заказа.</Text>
      </div>
      <Tabs.List aria-label="Настройки корзины" className="flex-wrap gap-y-1 px-6">
        <Tabs.Trigger value="delivery">Доставка</Tabs.Trigger>
        {canRead && <Tabs.Trigger value="services">Доп. услуги</Tabs.Trigger>}
      </Tabs.List>
    </Container>
    <Tabs.Content value={section} className="mt-4">{children}</Tabs.Content>
  </Tabs>
}
