"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { FetchError } from "@medusajs/js-sdk"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { claimTexnoCart, clearTexnoCartCapability, retrieveCartConfiguration } from "./texno-cart"
import {
  getAuthHeaders,
  getCacheTag,
  getPendingCustomer,
  removeAuthToken,
  removeCartId,
  removePendingCustomer,
  setAuthToken,
  setPendingCustomer,
} from "./cookies"

export type CustomerAuthState =
  | { state: "error"; error: string }
  | { state: "verification_required"; email: string }
  | { state: "success" }
  | null

const formText = (formData: FormData, key: string) => { const value = formData.get(key); return typeof value === "string" ? value : "" }
const textField = (formData: FormData, key: string) => formText(formData, key).trim()
const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const validPhone = (value: string) => !value || (/^\+?[\d\s()\-]+$/.test(value) && value.replace(/\D/g, "").length >= 10 && value.replace(/\D/g, "").length <= 15)
const validName = (value: string) => Boolean(value.trim()) && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value)

function accountError(error: unknown, fallback = "Не удалось сохранить данные. Повторите попытку.") {
  const failure = error as FetchError
  if (failure.status === 401) return "Войдите в аккаунт снова."
  if (failure.status === 400 && failure.message && !failure.message.startsWith("Invalid request")) return failure.message.slice(0, 300)
  return fallback
}

async function invalidateCustomer() {
  const tag = await getCacheTag("customers")
  if (tag) revalidateTag(tag, { expire: 0 })
}

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    const authHeaders = await getAuthHeaders()

    if (!("authorization" in authHeaders)) return null

    const headers = {
      ...authHeaders,
    }

    return await sdk.client
      .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
        method: "GET",
        query: {
          fields: "*addresses,*orders",
        },
        headers,
        cache: "no-store",
      })
      .then(({ customer }) => customer)
      .catch(() => null)
  }

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  if (body.first_name !== undefined && !validName(body.first_name ?? "")) throw new Error("Укажите имя до 100 символов")
  if (body.last_name !== undefined && !validName(body.last_name ?? "")) throw new Error("Укажите фамилию до 100 символов")
  if (body.phone !== undefined && !validPhone(body.phone ?? "")) throw new Error("Укажите телефон из 10–15 цифр")
  const headers = {
    ...(await getAuthHeaders()),
  }

  const updateRes = await sdk.store.customer
    .update(body, {}, headers)
    .then(({ customer }) => customer)
    .catch(medusaError)

  await invalidateCustomer()

  return updateRes
}

export async function signup(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const password = formText(formData, "password")
  const customerForm = {
    email: textField(formData, "email").toLowerCase(),
    first_name: textField(formData, "first_name"),
    last_name: textField(formData, "last_name"),
    phone: textField(formData, "phone"),
  }
  if (!validName(customerForm.first_name) || !validName(customerForm.last_name)) return { state: "error", error: "Укажите имя и фамилию до 100 символов" }
  if (!validEmail(customerForm.email)) return { state: "error", error: "Укажите корректный email" }
  if (!validPhone(customerForm.phone)) return { state: "error", error: "Укажите телефон из 10–15 цифр" }
  if (password.length < 8 || password.length > 128) return { state: "error", error: "Пароль должен содержать от 8 до 128 символов" }
  if (formData.get("consent") !== "on") return { state: "error", error: "Подтвердите согласие на обработку персональных данных" }

  try {
    await sdk.auth.register("customer", "emailpass", {
      email: customerForm.email,
      password,
    })
  } catch (error) {
    if (/already exists|already registered|duplicate/i.test((error as Error).message)) return { state: "error", error: "Аккаунт с этим email уже существует. Войдите в него." }
    return { state: "error", error: accountError(error, "Не удалось создать аккаунт. Повторите попытку.") }
  }

  // Persist the extra signup fields. The customer record is created during
  // login, which is deferred until after email verification when the backend
  // requires it.
  await setPendingCustomer(customerForm)

  // Continue by logging in. The login response tells us whether the backend
  // requires email verification — we don't need a storefront-side flag.
  return completeLogin(customerForm.email, password)
}

export async function login(
  _currentState: unknown,
  formData: FormData
): Promise<CustomerAuthState> {
  const email = textField(formData, "email")
  const password = formText(formData, "password")
  if (!validEmail(email) || !password || password.length > 256) return { state: "error", error: "Укажите email и пароль" }

  return completeLogin(email, password)
}

// Logs the customer in and reconciles the customer record. The behavior is
// driven entirely by the backend's login response, so it works whether or not
// email verification is enabled.
async function completeLogin(
  email: string,
  password: string
): Promise<CustomerAuthState> {
  let result: Awaited<ReturnType<typeof sdk.auth.login>>

  try {
    result = await sdk.auth.login("customer", "emailpass", { email, password }).catch((error: FetchError) => {
      if (error.status !== 401 || email === email.toLowerCase()) throw error
      email = email.toLowerCase()
      return sdk.auth.login("customer", "emailpass", { email, password })
    })
  } catch (error) {
    return { state: "error", error: (error as FetchError).status === 401 ? "Неверный email или пароль." : accountError(error, "Не удалось войти. Повторите попытку.") }
  }

  // A `location` is returned by third-party auth providers, which this flow
  // doesn't support.
  if (typeof result === "object" && "location" in result) {
    return {
      state: "error",
      error: "Этот способ входа пока недоступен.",
    }
  }

  // A verification challenge does not imply that a message was sent.
  if (
    typeof result === "object" &&
    "verification_required" in result &&
    result.verification_required
  ) {
    // Sending mail requires a configured delivery provider. Do not claim that
    // a message was sent simply because the auth endpoint returned a challenge.
    return { state: "verification_required", email }
  }

  if (typeof result !== "string") {
    return {
      state: "error",
      error: "Для входа требуется дополнительное подтверждение. Обратитесь в магазин.",
    }
  }

  let token = result

  // The token may not be tied to a customer record yet — right after
  // registration, or after verifying a brand-new account. Ask the backend:
  // `/store/customers/me` rejects tokens without a registered actor, so a
  // failed retrieve means we still need to create the customer, then log in
  // again to obtain a customer-bound token.
  let customerExists: boolean
  try {
    await sdk.store.customer.retrieve({}, { authorization: `Bearer ${token}` })
    customerExists = true
  } catch (error) {
    if (![401, 404].includes((error as FetchError).status ?? 0)) return { state: "error", error: "Не удалось открыть аккаунт. Повторите попытку." }
    customerExists = false
  }

  if (!customerExists) {
    const stored = await getPendingCustomer()
    const pending = stored?.email === email ? stored : null

    try {
      await sdk.store.customer.create(
        {
          email,
          first_name: pending?.first_name,
          last_name: pending?.last_name,
          phone: pending?.phone,
        },
        {},
        { authorization: `Bearer ${token}` }
      )

      token = (await sdk.auth.login("customer", "emailpass", {
        email,
        password,
      })) as string
    } catch (error) {
      return { state: "error", error: accountError(error, "Не удалось создать профиль покупателя. Повторите вход.") }
    }

  }
  await removePendingCustomer()

  await setAuthToken(token)

  await invalidateCustomer()

  try {
    await transferCart()
  } catch { /* The authenticated account remains valid if cart sync is temporarily unavailable. */ }

  return { state: "success" }
}

// Confirms a customer's email using the token from the verification link.
//
// The confirm route doesn't require authentication, so this works even when the
// customer opens the link on a different device than the one they signed up on.
export async function confirmEmailVerification(
  token: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await sdk.auth.verification.confirm({ code: token })
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

export async function signout(countryCode: string) {
  try { await sdk.auth.logout() } catch { /* Local HttpOnly credentials are cleared even if the auth service is unavailable. */ }
  await removeAuthToken()
  await removePendingCustomer()

  const customerCacheTag = await getCacheTag("customers")
  if (customerCacheTag) revalidateTag(customerCacheTag, { expire: 0 })

  await removeCartId()
  await clearTexnoCartCapability()

  const cartCacheTag = await getCacheTag("carts")
  if (cartCacheTag) revalidateTag(cartCacheTag, { expire: 0 })

  redirect(`/${countryCode}/account`)
}

export async function transferCart() {
  if ("authorization" in await getAuthHeaders()) await claimTexnoCart()
}

export async function updateCustomerProfileName(_state: unknown, formData: FormData) {
  const first_name = textField(formData, "first_name")
  const last_name = textField(formData, "last_name")
  if (!validName(first_name) || !validName(last_name)) return { success: false, error: "Укажите имя и фамилию до 100 символов" }
  try { await updateCustomer({ first_name, last_name }); return { success: true, error: null } } catch (error) { return { success: false, error: accountError(error) } }
}

export async function updateCustomerProfilePhone(_state: unknown, formData: FormData) {
  const phone = textField(formData, "phone")
  if (!validPhone(phone)) return { success: false, error: "Укажите телефон из 10–15 цифр" }
  try { await updateCustomer({ phone }); return { success: true, error: null } } catch (error) { return { success: false, error: accountError(error) } }
}

export async function updateCustomerEmail(_state: unknown, formData: FormData) {
  const email = textField(formData, "email").toLowerCase()
  const currentPassword = formText(formData, "current_password")
  if (!validEmail(email)) return { success: false, error: "Укажите корректный email" }
  if (!currentPassword) return { success: false, error: "Введите текущий пароль" }
  try {
    await sdk.client.fetch("/store/account-security", { method: "POST", headers: await getAuthHeaders(), body: { operation: "email", email, current_password: currentPassword } })
    await invalidateCustomer()
    return { success: true, error: null }
  } catch (error) { return { success: false, error: accountError(error) } }
}

export async function updateCustomerPassword(_state: unknown, formData: FormData) {
  const password = formText(formData, "new_password")
  const currentPassword = formText(formData, "old_password")
  if (password.length < 8 || password.length > 128) return { success: false, error: "Пароль должен содержать от 8 до 128 символов" }
  if (password !== formText(formData, "confirm_password")) return { success: false, error: "Пароли не совпадают" }
  if (!currentPassword) return { success: false, error: "Введите текущий пароль" }
  try {
    await sdk.client.fetch("/store/account-security", { method: "POST", headers: await getAuthHeaders(), body: { operation: "password", password, current_password: currentPassword } })
    return { success: true, error: null }
  } catch (error) { return { success: false, error: accountError(error) } }
}

async function customerAddress(formData: FormData) {
  const address = {
    address_1: textField(formData, "address_1"),
    address_2: textField(formData, "address_2"),
    city: textField(formData, "city"),
    province: textField(formData, "province"),
    country_code: textField(formData, "country_code"),
  }
  if (!address.address_1 || address.address_1.length > 255 || !address.city || address.city.length > 100) throw new Error("Укажите город и улицу с номером дома")
  const country = (await retrieveCartConfiguration().catch(() => null))?.country_code
  if (!country) throw new Error("Не удалось проверить страну доставки. Повторите попытку.")
  if (address.country_code !== country) throw new Error("Выберите доступную страну доставки")
  if (Object.values(address).some((value) => value.length > 255 || /[\u0000-\u001f\u007f]/.test(value))) throw new Error("Проверьте поля адреса: не более 255 символов")
  return address
}

export const addCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> => {
  const isDefaultBilling = (currentState.isDefaultBilling as boolean) || false
  const isDefaultShipping = (currentState.isDefaultShipping as boolean) || false

  let address: HttpTypes.StoreCreateCustomerAddress
  try { address = { ...await customerAddress(formData), is_default_billing: isDefaultBilling, is_default_shipping: isDefaultShipping || formData.get("is_default_shipping") === "on" } } catch (error) { return { success: false, error: (error as Error).message } }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .createAddress(address, {}, headers)
    .then(async () => {
      await invalidateCustomer()
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: accountError(err, "Не удалось сохранить адрес. Повторите попытку.") }
    })
}

export const deleteCustomerAddress = async (
  addressId: string
): Promise<void> => {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(addressId)) throw new Error("Адрес не найден")
  const headers = {
    ...(await getAuthHeaders()),
  }

  await sdk.store.customer.deleteAddress(addressId, headers)
  await invalidateCustomer()
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> => {
  const addressId =
    (currentState.addressId as string) || (formData.get("addressId") as string)

  if (!addressId || !/^[a-zA-Z0-9_-]{1,200}$/.test(addressId)) {
    return { success: false, error: "Адрес не найден" }
  }

  let address: HttpTypes.StoreUpdateCustomerAddress
  try { address = { ...await customerAddress(formData), ...(formData.has("shipping_default_control") ? { is_default_shipping: formData.get("is_default_shipping") === "on" } : {}) } } catch (error) { return { success: false, error: (error as Error).message } }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.customer
    .updateAddress(addressId, address, {}, headers)
    .then(async () => {
      await invalidateCustomer()
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: accountError(err, "Не удалось сохранить адрес. Повторите попытку.") }
    })
}
