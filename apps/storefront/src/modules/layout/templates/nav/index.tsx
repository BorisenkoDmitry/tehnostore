import { getNavigation } from "@lib/data/navigation"
import { retrieveCart } from "@lib/data/cart"
import StorefrontShell from "@modules/layout/components/storefront-shell"

export default async function Nav({ children }: { children: React.ReactNode }) {
  const [navigation, cart] = await Promise.all([getNavigation(), retrieveCart().catch(() => null)])
  const cartCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  return <StorefrontShell navigation={navigation} cartCount={cartCount}>{children}</StorefrontShell>
}
