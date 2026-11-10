import { Metadata } from "next"
import { notFound } from "next/navigation"
import { retrieveProductPage } from "@lib/data/product-page"
import { getRegion, listRegions } from "@lib/data/regions"
import ProductTemplate from "@modules/products/templates"
import { HttpTypes } from "@medusajs/types"
import { buildCatalogStructuredData } from "@lib/util/catalog-structured-data"
import { isVariantInStock } from "@lib/util/inventory"
import {
  buildProductStructuredData,
  getPricedVariants,
  toJsonLd,
} from "@lib/util/product-structured-data"
import { getSiteOrigin, getStoreName, listCountryCodes } from "@lib/util/site"
import { CatalogProductDetails, retrieveCatalogProduct } from "@lib/data/catalog-product"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

export const dynamic = "force-dynamic"
export const revalidate = 60

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { handle } = params
  const region = await getRegion(params.countryCode)

  if (!region) {
    notFound()
  }

  const product = await retrieveProductPage(params.countryCode, handle)

  if (!product) {
    notFound()
  }

  const [origin, regions] = await Promise.all([getSiteOrigin(), listRegions()])
  const path = `/products/${product.handle}`
  const productUrl = `${origin}/${params.countryCode}${path}`
  const catalog = Boolean(product.metadata?.catalog_scope) ? await retrieveCatalogProduct(product.id) : undefined
  const description = catalog?.seo?.description || product.description || product.title
  const title = catalog?.seo?.title || `${product.title} | ${await getStoreName()}`

  return {
    title,
    description,
    alternates: {
      canonical: productUrl,
      languages: Object.fromEntries(
        listCountryCodes(regions).map((code) => [
          `en-${code.toUpperCase()}`,
          `${origin}/${code}${path}`,
        ])
      ),
      types: { "text/markdown": `${productUrl}.md` },
    },
    openGraph: {
      title,
      description,
      url: productUrl,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
  }
}

const ProductMetaTags = ({
  product,
  region,
  catalog,
}: {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  catalog?: CatalogProductDetails
}) => {
  const variants = getPricedVariants(product)
  const cheapest = variants.reduce<HttpTypes.StoreProductVariant | undefined>(
    (min, v) =>
      !min ||
      v.calculated_price!.calculated_amount! <
        min.calculated_price!.calculated_amount!
        ? v
        : min,
    undefined
  )
  const catalogPrices = catalog?.variants.map((variant) => variant.price).filter((price): price is number => price != null) ?? []
  const currency = (catalog?.currency_code ?? region.currency_code).toUpperCase()
  const amount = catalog
    ? catalogPrices.length ? Math.min(...catalogPrices).toFixed(2) : undefined
    : cheapest?.calculated_price?.calculated_amount?.toFixed(2)

  return (
    <>
      <meta property="og:type" content="product" />
      {amount && (
        <>
          <meta property="product:price:amount" content={amount} />
          <meta property="product:price:currency" content={currency} />
          <meta property="og:price:amount" content={amount} />
          <meta property="og:price:currency" content={currency} />
        </>
      )}
      {!catalog && <meta
        property="product:availability"
        content={variants.some(isVariantInStock) ? "in stock" : "out of stock"}
      />}
    </>
  )
}

export default async function ProductPage(props: Props) {
  const params = await props.params
  const region = await getRegion(params.countryCode)

  if (!region) {
    notFound()
  }

  const pricedProduct = await retrieveProductPage(params.countryCode, params.handle)

  if (!pricedProduct) {
    notFound()
  }

  const origin = await getSiteOrigin()
  const catalog = Boolean(pricedProduct.metadata?.catalog_scope)
    ? await retrieveCatalogProduct(pricedProduct.id)
    : undefined
  const structuredData = catalog ? buildCatalogStructuredData(pricedProduct, catalog, `${origin}/${params.countryCode}/products/${pricedProduct.handle}`) : buildProductStructuredData({
    product: pricedProduct,
    region,
    countryCode: params.countryCode,
    productUrl: `${origin}/${params.countryCode}/products/${pricedProduct.handle}`,
    storeName: await getStoreName(),
  })

  return (
    <>
      <ProductMetaTags product={pricedProduct} region={region} catalog={catalog} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLd(structuredData) }}
      />
      <ProductTemplate
        product={pricedProduct}
        region={region}
        countryCode={params.countryCode}
      />
    </>
  )
}
