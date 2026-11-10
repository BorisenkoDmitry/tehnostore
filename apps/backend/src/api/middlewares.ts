import { authenticate, authorize, authorizeIfNecessary, configureStoreSearch, defineMiddlewares, validateAndTransformBody } from '@medusajs/framework/http'
import { PolicyOperation } from "@medusajs/framework/utils"
import { UpdateNavigationSchema } from "./admin/navigation/validators"
import { CreateTexnoCart, TexnoCartItems, TexnoCartQuote, TexnoCartCheckout } from "./store/texno-cart/validators"
import {
  blockNativeCheckoutPayments,
  blockNativeOrderTransfer,
  guardNativeCartLine,
  guardNativeCartShipping,
  guardNativeCartWrite,
  guardNativeOrderReturn,
  guardTexnoNativeCart,
  guardTexnoNativeOrder,
  validateNativeCheckoutPath,
} from "./store/texno-cart/native-guard"
import { CheckoutServicesSchema, CheckoutSettingsSchema } from "./admin/checkout-settings/validators"
import { CatalogProductSchema, CatalogDefinitionSchema, CatalogStockSchema, CatalogCategorySchema, CatalogProfileSchema } from "./admin/catalog-cms/validators"
import { CreateInsalesImportSchema, ActionInsalesImportSchema } from "./admin/insales-import/validators"
import { contentMiddlewares } from "./content-middlewares"
import { AccountSecuritySchema } from "./store/account-security/validators"
import { CustomerOrderStatusSchema } from "./admin/customer-orders/validators"
import { CatalogTrashBodySchema, ConstructorProductSchema, FolderSchema, GraphSchema, ProductCanvasListSchema, type CatalogTrashBody, type ConstructorProductBody, type FolderBody, type GraphBody } from "./admin/catalog-constructor/validators"
import { matchCatalogVariantFilters } from "../search/helpers/match-catalog-variants"
import { requireCurrentAdminUser } from "./admin-user-guard"
import { invalidateCatalogAfterWrite } from "./catalog-cache-middleware"

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
    { matcher: "/admin", middlewares: [requireCurrentAdminUser] },
    { matcher: "/admin/*", method: ["POST", "DELETE"], middlewares: [invalidateCatalogAfterWrite] },
    { matcher: "/rbac", middlewares: [requireCurrentAdminUser] },
    { matcher: "/admin/customer-orders/orders/:id/status", method: "POST", middlewares: [
      authorize([{ resource: "order", operation: PolicyOperation.update }]), validateAndTransformBody(CustomerOrderStatusSchema),
    ] },
    { matcher: "/store/texno-orders/:id", method: "GET", middlewares: [authenticate("customer", ["bearer", "session"])] },
    { matcher: "/store/account-security", method: "POST", middlewares: [authenticate("customer", ["bearer", "session"]), validateAndTransformBody(AccountSecuritySchema)] },
    { matcher: "/admin/catalog-cms/profile", method: "POST", middlewares: [validateAndTransformBody(CatalogProfileSchema)] },
    { matcher: "/store/texno-cart", middlewares: [authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })] },
    { matcher: "/store/texno-cart/*", middlewares: [authenticate("customer", ["session", "bearer"], { allowUnauthenticated: true })] },
    { matcher: "/store/texno-cart/me", middlewares: [authenticate("customer", ["session", "bearer"])] },
    { matcher: "/store/texno-cart/me", method: "POST", middlewares: [validateAndTransformBody(CreateTexnoCart)] },
    ...contentMiddlewares,
    { matcher: "/admin/catalog-cms/products/:id", method: "POST", middlewares: [validateAndTransformBody(CatalogProductSchema)] },
    { matcher: "/admin/catalog-cms/definitions", method: "POST", middlewares: [validateAndTransformBody(CatalogDefinitionSchema)] },
    { matcher: "/admin/catalog-cms/stock/:id", method: "POST", middlewares: [validateAndTransformBody(CatalogStockSchema)] },
    { matcher: "/admin/catalog-cms/categories", method: "POST", middlewares: [validateAndTransformBody(CatalogCategorySchema)] },
    { matcher: "/admin/catalog-constructor", method: "GET", middlewares: [
      authorize([{ resource: "product_category", operation: PolicyOperation.read }]),
    ] },
    { matcher: "/admin/catalog-constructor/trash", method: "GET", middlewares: [
      authorizeIfNecessary((req) => req.query.kind !== "product", { resource: "product_category", operation: PolicyOperation.read }),
      authorizeIfNecessary((req) => req.query.kind !== "folder", { resource: "product", operation: PolicyOperation.read }),
    ] },
    { matcher: "/admin/catalog-constructor/trash", method: "POST", middlewares: [
      validateAndTransformBody(CatalogTrashBodySchema),
      authorizeIfNecessary((req) => (req.validatedBody as CatalogTrashBody).kind === "folder", { resource: "product_category", operation: PolicyOperation.update }),
      authorizeIfNecessary((req) => (req.validatedBody as CatalogTrashBody).kind === "product", { resource: "product", operation: PolicyOperation.update }),
    ] },
    { matcher: "/admin/catalog-constructor", method: "POST", middlewares: [
      validateAndTransformBody(GraphSchema),
      authorizeIfNecessary((req) => {
        const graph = req.validatedBody as GraphBody
        return graph.folders.length > 0 || !!graph.shortcuts?.length
      }, { resource: "product_category", operation: PolicyOperation.update }),
      authorizeIfNecessary((req) => (req.validatedBody as GraphBody).products.length > 0, { resource: "product", operation: PolicyOperation.update }),
    ] },
    { matcher: "/admin/catalog-constructor/folders", method: "POST", middlewares: [
      validateAndTransformBody(FolderSchema),
      authorizeIfNecessary((req) => !!(req.validatedBody as FolderBody).id, { resource: "product_category", operation: PolicyOperation.update }),
      authorizeIfNecessary((req) => !(req.validatedBody as FolderBody).id, { resource: "product_category", operation: PolicyOperation.create }),
    ] },
    { matcher: "/admin/catalog-constructor/folders/:id/filters", method: "GET", middlewares: [
      authorize([{ resource: "product_category", operation: PolicyOperation.read }, { resource: "product", operation: PolicyOperation.read }]),
    ] },
    { matcher: "/admin/catalog-constructor/products*", method: "GET", middlewares: [
      authorize([{ resource: "product", operation: PolicyOperation.read }]),
    ] },
    { matcher: "/admin/catalog-constructor/products/filter", method: "POST", middlewares: [
      authorize([{ resource: "product", operation: PolicyOperation.read }]), validateAndTransformBody(ProductCanvasListSchema),
    ] },
    { matcher: "/admin/catalog-constructor/variants", method: "GET", middlewares: [
      authorize([{ resource: "product_variant", operation: PolicyOperation.read }, { resource: "product", operation: PolicyOperation.read }]),
    ] },
    { matcher: "/admin/catalog-constructor/values", method: "GET", middlewares: [
      authorize([{ resource: "product", operation: PolicyOperation.read }]),
    ] },
    { matcher: "/admin/catalog-constructor/products", method: "POST", middlewares: [
      validateAndTransformBody(ConstructorProductSchema),
      authorizeIfNecessary((req) => !!(req.validatedBody as ConstructorProductBody).id, { resource: "product", operation: PolicyOperation.update }),
      authorizeIfNecessary((req) => !!(req.validatedBody as ConstructorProductBody).id, { resource: "product_variant", operation: PolicyOperation.update }),
      authorizeIfNecessary((req) => !(req.validatedBody as ConstructorProductBody).id, { resource: "product", operation: PolicyOperation.create }),
      authorizeIfNecessary((req) => (req.validatedBody as ConstructorProductBody).variants.some((variant) => !variant.id), { resource: "product_variant", operation: PolicyOperation.create }),
      authorizeIfNecessary((req) => (req.validatedBody as ConstructorProductBody).axes !== undefined, { resource: "product_option", operation: [PolicyOperation.create, PolicyOperation.update] }),
      authorizeIfNecessary((req) => !(req.validatedBody as ConstructorProductBody).id, { resource: "sales_channel", operation: PolicyOperation.update }),
    ] },
    { matcher: "/admin/insales-import", method: "POST", bodyParser: { sizeLimit: "30mb" }, middlewares: [validateAndTransformBody(CreateInsalesImportSchema)] },
    { matcher: "/admin/insales-import/:id", method: "POST", middlewares: [validateAndTransformBody(ActionInsalesImportSchema)] },
    { matcher: "/admin/checkout-settings", method: "POST", middlewares: [validateAndTransformBody(CheckoutSettingsSchema)] },
    { matcher: "/admin/checkout-settings/services", method: "POST", middlewares: [
      authorize([{ resource: "region", operation: PolicyOperation.update }]), validateAndTransformBody(CheckoutServicesSchema),
    ] },
    { matcher: "/store/texno-cart/:id/claim", method: "POST", middlewares: [authenticate("customer", ["session", "bearer"]), validateAndTransformBody(CreateTexnoCart)] },
    // Prefix mounts use the same Express parameter decoder as the native handlers.
    { matcher: "/store/carts", middlewares: [validateNativeCheckoutPath] },
    { matcher: "/store/carts/:id", middlewares: [guardTexnoNativeCart] },
    { matcher: "/store/carts/:id/line-items/:line_id", methods: ["POST", "DELETE"], middlewares: [guardNativeCartLine] },
    { matcher: "/store/carts", method: "POST", middlewares: [guardNativeCartWrite] },
    { matcher: "/store/carts/:id", method: "POST", middlewares: [guardNativeCartWrite] },
    { matcher: "/store/shipping-options", middlewares: [validateNativeCheckoutPath] },
    { matcher: "/store/shipping-options", method: "GET", middlewares: [guardNativeCartShipping] },
    { matcher: "/store/shipping-options/:id/calculate", method: "POST", middlewares: [guardNativeCartShipping] },
    { matcher: "/store/orders", middlewares: [validateNativeCheckoutPath] },
    { matcher: "/store/orders/:id", middlewares: [guardTexnoNativeOrder] },
    { matcher: "/store/orders/:id/transfer/request", method: "POST", middlewares: [blockNativeOrderTransfer] },
    { matcher: "/store/orders/:id/transfer/cancel", method: "POST", middlewares: [blockNativeOrderTransfer] },
    { matcher: "/store/returns", method: "POST", middlewares: [guardNativeOrderReturn] },
    { matcher: "/store/payment-collections", middlewares: [blockNativeCheckoutPayments] },
    { matcher: "/store/texno-cart", method: "POST", middlewares: [validateAndTransformBody(CreateTexnoCart)] },
    { matcher: "/store/texno-cart/:id/items", method: "POST", middlewares: [validateAndTransformBody(TexnoCartItems)] },
    { matcher: "/store/texno-cart/:id/quote", method: "POST", middlewares: [validateAndTransformBody(TexnoCartQuote)] },
    { matcher: "/store/texno-cart/:id/checkout", method: "POST", middlewares: [validateAndTransformBody(TexnoCartCheckout)] },
    {
      method: ["POST"],
      matcher: "/admin/navigation",
      middlewares: [validateAndTransformBody(UpdateNavigationSchema)],
    },
    {
      method: ['POST'],
      matcher: '/store/search',
      middlewares: [
        configureStoreSearch({
          allowed_indexes: {
            product: true,
          },
        }),
        matchCatalogVariantFilters,
      ],
    },
  ],
})
