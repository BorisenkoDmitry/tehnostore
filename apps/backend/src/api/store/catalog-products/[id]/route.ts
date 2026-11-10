import { MedusaStoreRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, getVariantAvailability, MedusaError, Modules, QueryContext } from "@medusajs/framework/utils"
import { CatalogAttributeInput } from "../../../../modules/catalog-attributes/types"
import { configurationAxisDefinitions, configurationModelCategory, configurationPickerNeedsList, configuredProductConfigurations, type ConfigurationProduct } from "../../../../lib/product-configurations"
import { productDescription } from "../../../../lib/product-description"
import { catalogKind, getCatalogProfile } from "../../../../lib/catalog-cms"
import { stockProvenanceKnown } from "../../../../lib/texno-cart-rules"
import { publishedCategoryIds } from "../../../../lib/catalog-hierarchy"
import { canonicalLibraryCode, detachedVariationFields, LIBRARY_RAM, libraryChoiceChanged, libraryChoices, librarySpecificationValues } from "../../../../lib/catalog-variation-library"
import { catalogComparisonPrice, saleOriginalPrice, type CatalogCalculatedPrice } from "../../../../lib/catalog-sale-price"
import { cachedCatalogRead, getCatalogCategories, getCatalogDefinitions } from "../../../../lib/catalog-read-cache"

function publicAttributes(input: CatalogAttributeInput[] | undefined, order: Map<string, number>, roles: Map<string, string>) {
  return (input ?? [])
    .filter((attribute) => attribute.public === true && !attribute.label.startsWith("__"))
    .sort((a, b) => (order.get(a.key) ?? 10000) - (order.get(b.key) ?? 10000))
    .map((attribute) => ({
      key: attribute.key,
      label: attribute.label,
      raw_values: attribute.rawValues,
      values: attribute.values.map((value) => value.value),
      type: attribute.dataType,
      role: roles.get(attribute.key) ?? "spec",
      units: [...new Set(attribute.values.map((value) => value.unit).filter(Boolean))],
    }))
}

type CatalogProductGraph = Omit<ConfigurationProduct, "variants" | "catalog_record"> & {
  description?: string | null
  catalog_record?: { attributes?: CatalogAttributeInput[]; source_data?: Record<string, unknown> } | null
  variants?: {
    id: string
    title: string
    variant_rank?: number | null
    metadata?: Record<string, unknown>
    calculated_price?: CatalogCalculatedPrice | null
    catalog_variant?: { attributes?: CatalogAttributeInput[]; source_data?: Record<string, unknown> } | null
  }[]
}

export async function GET(req: MedusaStoreRequest, res: MedusaResponse) {
  const profile = await getCatalogProfile(req.scope)
  if (!/^prod_[A-Za-z0-9]+$/.test(req.params.id) || req.params.id.length > 100) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  }
  const salesChannelIds = req.publishable_key_context?.sales_channel_ids ?? []
  if (!salesChannelIds.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  // Scope through the link entry point, as in Medusa's own Store product middleware.
  const { data: links } = await query.graph({
    entity: "product_sales_channel",
    fields: ["product_id"],
    filters: { product_id: req.params.id, sales_channel_id: salesChannelIds },
    pagination: { take: 1 },
  })
  if (!links.length) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")

  const [data, livePrices, allCategories, definitions] = await Promise.all([
    cachedCatalogRead(req.scope, `product:${req.params.id}`, ["Product:list:*", "ProductVariant:list:*", "CatalogRecord:list:*", "CatalogVariant:list:*"], async () => (await query.graph({
    entity: "product",
    fields: [
      "id", "handle", "title", "description", "metadata", "catalog_record.attributes", "catalog_record.source_data",
      "categories.id", "categories.handle", "categories.parent_category_id", "categories.is_active", "categories.is_internal", "categories.metadata",
      "variants.id", "variants.title", "variants.metadata", "variants.variant_rank",
      "variants.catalog_variant.attributes", "variants.catalog_variant.source_data",
    ],
    filters: { id: req.params.id, status: "published" },
    })).data),
    query.graph({
      entity: "product", fields: ["id", "variants.id", "variants.calculated_price.*"],
      filters: { id: req.params.id, status: "published" },
      context: { variants: { calculated_price: QueryContext({ currency_code: profile.currency_code, region_id: profile.region_id, quantity: 1 }) } },
    }, { cache: { enable: false } }),
    getCatalogCategories(req.scope), getCatalogDefinitions(req.scope),
  ])
  const product = data[0] as unknown as CatalogProductGraph | undefined
  if (!product?.catalog_record || product.metadata?.catalog_scope !== profile.scope || (!product.metadata.insales_product_id && product.metadata.catalog_origin !== "manual")) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
  }
  const published = publishedCategoryIds(allCategories, profile.scope)
  if (!product.categories?.some((category) => published.has(category.id))) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product category is not published")
  const productType = profile.product_types.find((type) => type.code === catalogKind(product.metadata) && type.enabled)
  if (!productType) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product type is not published")
  const priceVariants = livePrices.data[0]?.variants as unknown as { id: string; calculated_price?: CatalogCalculatedPrice | null }[] | undefined
  const prices = new Map(priceVariants?.map((variant) => [variant.id, variant.calculated_price]))
  product.variants = product.variants?.map((variant) => ({ ...variant, calculated_price: prices.get(variant.id) }))
  const attributeOrder = new Map(definitions.map((definition) => [definition.code, definition.position]))
  const attributeRoles = new Map(definitions.map((definition) => [definition.code, definition.role]))
  const variants = product.metadata.catalog_origin === "manual" && product.metadata.catalog_constructor_axis_order
    ? [...(product.variants ?? [])].sort((a, b) => (a.variant_rank ?? 0) - (b.variant_rank ?? 0))
    : product.variants ?? []
  const variantSpecFields = Array.isArray(product.metadata.catalog_variant_spec_fields) ? product.metadata.catalog_variant_spec_fields : []
  const detached = detachedVariationFields(product.metadata)
  const { configured: configuredAxes, axes: axisDefinitions } = configurationAxisDefinitions(product, productType.variant_axes, definitions)
  const templateDefinitions = definitions.filter((definition) => definition.public && definition.enabled && productType.variant_axes.includes(definition.code))
  const model = configurationModelCategory(product)
  const siblingsPromise = (async (): Promise<ConfigurationProduct[]> => {
  if (model) {
    // categories is a same-module Product relation, filtered in the database.
    // Fail closed for an oversized/ambiguous category instead of scanning it.
    const candidates = await cachedCatalogRead(req.scope, `model:${model.id}`, ["Product:list:*", "ProductVariant:list:*", "ProductCategory:list:*", "CatalogRecord:list:*", "CatalogVariant:list:*"], async () => {
      const ids = await req.scope.resolve(Modules.PRODUCT).listProducts({ status: "published", categories: { id: model.id } }, { select: ["id"], take: 201 })
      if (!ids.length || ids.length > 200) return []
      const { data } = await query.graph({
        entity: "product",
        fields: ["id", "handle", "title", "metadata", "categories.id", "categories.handle", "categories.parent_category_id", "catalog_record.attributes", "variants.id", "variants.title", "variants.metadata", "variants.catalog_variant.attributes"],
        filters: { id: ids.map((candidate) => candidate.id), status: "published" },
        pagination: { take: 200 },
      })
      return data
    })
    if (candidates.length) {
      const { data: allowed } = await query.graph({
        entity: "product_sales_channel",
        fields: ["product_id"],
        filters: { product_id: candidates.map((candidate) => candidate.id), sales_channel_id: salesChannelIds },
        pagination: { take: 200 * salesChannelIds.length },
      })
      const allowedIds = new Set(allowed.map((link) => link.product_id))
      return (candidates as unknown as ConfigurationProduct[]).filter((candidate) => allowedIds.has(candidate.id))
    }
  }
  return [product]
  })()
  // With multiple allowed channels stock has no unambiguous delivery context.
  const [siblings, availability] = await Promise.all([
    siblingsPromise,
    salesChannelIds.length === 1
      ? getVariantAvailability(query, { variant_ids: variants.map((variant) => variant.id), sales_channel_id: salesChannelIds[0] })
      : Promise.resolve({}),
  ])
  const configurations = configuredProductConfigurations({ ...product, variants }, siblings, axisDefinitions, templateDefinitions)
  const pickerCodes = axisDefinitions.map(({ code }) => code)
  const chooseFromList = product.metadata.catalog_origin === "manual" && product.metadata.catalog_constructor_axis_order && !product.metadata.catalog_family_id &&
    configurationPickerNeedsList(configurations, pickerCodes)
  const allowConfigurationJump = pickerCodes.includes(LIBRARY_RAM) && configurations.some(({ product_id }) => product_id !== product.id) &&
    configurationPickerNeedsList(configurations, pickerCodes)
  const commonAttributes = product.catalog_record.attributes
  const commonChoices = variants.length === 1 ? libraryChoices(product.metadata, variants[0].id) : {}
  const colorSwatches = definitions.find((definition) => definition.enabled && definition.public && definition.role === "color" && definition.choice_colors)?.choice_colors
  res.setHeader("Cache-Control", "no-store")
  res.json({
    product: {
      id: product.id,
      currency_code: profile.currency_code,
      checkout_available: true,
      kind: catalogKind(product.metadata),
      seo: product.metadata.catalog_seo ?? null,
      configurations,
      ...(detached.size ? { configured_axes_only: true } : {}),
      ...(allowConfigurationJump ? { allow_configuration_jump: true } : {}),
      ...(colorSwatches ? { color_swatches: colorSwatches } : {}),
      ...(chooseFromList ? { variant_selection: "list" } : {}),
      axes: axisDefinitions.map((definition) => ({ code: definition.code, label: definition.label, role: definition.role, control: definition.filter_control, values: [...new Set(configurations.map((configuration) => configuration.axes?.[definition.code]).filter((value): value is string => Boolean(value)))] })),
      description: productDescription(product.catalog_record.source_data, product.description, product.metadata.catalog_description_html),
      attributes: publicAttributes(librarySpecificationValues(commonAttributes, commonChoices), attributeOrder, attributeRoles),
      variants: variants.map((variant) => {
        const stockKnown = stockProvenanceKnown(variant)
        const calculated = variant.calculated_price
        const price = calculated && calculated.currency_code === profile.currency_code ? calculated.calculated_amount : null
        const oldPrice = saleOriginalPrice(calculated) ?? catalogComparisonPrice(variant.metadata, profile.currency_code)
        const choices = libraryChoices(product.metadata, variant.id)
        const sourceAttributes = librarySpecificationValues(variant.catalog_variant?.attributes, choices)
        const common = librarySpecificationValues(commonAttributes, choices)
        if (variants.length > 1) {
          const changed = new Set(Object.values(choices).filter(libraryChoiceChanged).flatMap((choice) => choice.source_keys ?? []))
          sourceAttributes.push(...common.filter((attribute) => changed.has(attribute.key) && !sourceAttributes.some((source) => source.key === attribute.key)))
        }
        const attributes = publicAttributes(sourceAttributes, attributeOrder, attributeRoles)
          .filter((attribute) => !detached.has(canonicalLibraryCode(attribute.key)) && (!configuredAxes.includes(attribute.key) || variantSpecFields.includes(attribute.key)))
        for (const [code, choice] of Object.entries(choices)) {
          const definition = definitions.find((entry) => entry.code === code)
          if (variantSpecFields.includes(code) && definition?.enabled && definition.public && !attributes.some((attribute) => attribute.key === code)) {
            const value = choice.value
            attributes.push({ key: code, label: definition.label, raw_values: [value], values: [value], type: definition.type === "money" ? "number" : definition.type, role: definition.role, units: [] })
          }
        }
        if (variantSpecFields.includes("__price") && typeof price === "number" && Number.isFinite(price)) {
          const value = new Intl.NumberFormat("ru-RU", { style: "currency", currency: profile.currency_code }).format(price)
          attributes.push({ key: "__price", label: "Цена", raw_values: [value], values: [value], type: "text", role: "spec", units: [] })
        }
        return {
          id: variant.id,
          title: variant.title,
          price: typeof price === "number" && Number.isFinite(price) ? price : null,
          old_price: oldPrice != null && price != null && oldPrice > price ? oldPrice : null,
          stock_known: stockKnown,
          inventory_quantity: stockKnown ? availability[variant.id]?.availability ?? null : null,
          attributes,
        }
      }),
    },
  })
}
