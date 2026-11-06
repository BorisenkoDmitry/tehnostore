import { configureStoreSearch, defineMiddlewares, validateAndTransformBody } from '@medusajs/framework/http'
import { UpdateNavigationSchema } from "./admin/navigation/validators"

// The product index declares filterable `status` and `sales_channel_ids`, so
// the route narrows it to published products in the key's sales channels.
export default defineMiddlewares({
  routes: [
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
      ],
    },
  ],
})
