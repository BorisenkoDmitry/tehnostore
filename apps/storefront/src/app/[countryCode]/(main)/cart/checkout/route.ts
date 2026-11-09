import { NextResponse } from "next/server"

// Native form submission must never serialize contact details in a GET URL.
// The interactive checkout uses a same-origin server action with cart capability.
export async function POST() {
  return new NextResponse("Для оформления заказа включите JavaScript и вернитесь в корзину.", { status: 400 })
}
