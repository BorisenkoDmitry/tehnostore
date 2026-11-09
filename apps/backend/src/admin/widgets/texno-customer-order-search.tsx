import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container } from "@medusajs/ui"
import { Link, useMatch } from "react-router-dom"

const TexnoCustomerOrderSearch = () => {
  const orders = useMatch("/orders/*")
  const view = orders ? "orders" : "customers"
  const label = orders ? "Расширенный поиск заказов" : "Расширенный поиск покупателей"

  return (
    <Container className="flex justify-end px-6 py-3">
      <Button asChild size="small" variant="secondary">
        <Link to={`/customer-orders?view=${view}`}>{label}</Link>
      </Button>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: ["order.list", "customer.list"] })

export default TexnoCustomerOrderSearch
