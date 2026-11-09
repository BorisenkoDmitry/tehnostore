"use server"

import { sdk } from "@lib/config"

export async function submitContactRequest(input: { request_key: string; name: string; email: string; message: string; consent: boolean; website: string }) {
  try {
    await sdk.client.fetch("/store/content/leads", { method: "POST", body: input })
    return { received: true }
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0
    return { error: status === 429 ? "Слишком много обращений. Попробуйте позже." : status === 400 ? "Проверьте имя, email, сообщение и согласие." : "Не удалось сохранить обращение. Попробуйте ещё раз." }
  }
}
