import { changeTexnoItem } from "@lib/data/texno-cart"
import { getRegion } from "@lib/data/regions"
import { getRequestOrigin } from "@lib/util/site"
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"

/** Native POST fallback for the server-rendered, selected real variant. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ countryCode: string }> }) {
  const { countryCode } = await params
  if (!await getRegion(countryCode)) return new NextResponse("Страница не найдена", { status: 404 })
  const origin = getRequestOrigin(request)
  const submittedOrigin = request.headers.get("origin")
  if (submittedOrigin && ![origin, new URL(request.url).origin].includes(submittedOrigin)) {
    return new NextResponse("Запрос отклонён. Откройте корзину на сайте магазина.", { status: 403 })
  }
  const form = await request.formData()
  const variantId = String(form.get("variant_id") ?? "")
  const quantity = Number(form.get("quantity") ?? "1")
  const submittedId = String(form.get("mutation_id") ?? "")
  if (!/^variant_[A-Za-z0-9]+$/.test(variantId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return new NextResponse("Выберите действующий вариант и количество товара.", { status: 400 })
  }
  const mutationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submittedId) ? submittedId : randomUUID()
  const result = await changeTexnoItem({ variant_id: variantId, quantity, mutation_id: mutationId, add: true })
  if (result.error) return new NextResponse(result.error, { status: 400 })
  return NextResponse.redirect(`${origin}/${countryCode}/cart`, 303)
}