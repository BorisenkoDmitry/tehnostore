"use client"

import Image from "next/image"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useParams, useRouter } from "next/navigation"
import { changeTexnoItem, checkoutTexnoCart, chooseSavedCart, clearTexnoCart, quoteTexnoCart } from "@lib/data/texno-cart"
import type { CheckoutCustomer, CheckoutInput, OrderConfirmation, TexnoCartState } from "@lib/data/texno-cart-types"
import { notifyCartUpdated } from "@lib/util/cart-events"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import StoreButton from "@modules/common/components/store-button"
import { StoreIcon } from "@modules/layout/components/storefront-shell/icons"
import styles from "./texno-cart.module.css"

const labels: Record<string, string> = { street: "Улица", metro: "Станция метро", house: "Дом", building: "Корпус / строение", entrance: "Подъезд", apartment: "Квартира / офис", intercom: "Домофон", floor: "Этаж", pickup: "Пункт самовывоза", postal_code: "Почтовый индекс" }
const dateToday = (timeZone = "UTC") => new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
const connectionError = "Нет связи с магазином. Ваша корзина сохранена — попробуйте ещё раз."
const variantLabel = (title: string | null | undefined, productTitle: string) => title && !/^default( variant)?$/i.test(title) && title.trim() !== productTitle.trim() ? title : ""

export default function TexnoCart({ initialState, loadError, customer, documents = {} }: { initialState: TexnoCartState | null; loadError?: boolean; customer?: CheckoutCustomer | null; documents?: { offer?: string; consent?: string; privacy?: string } }) {
  const router = useRouter()
  const { countryCode } = useParams<{ countryCode: string }>()
  const [ready, setReady] = useState(false)
  const [state, setState] = useState(initialState)
  const [order, setOrder] = useState<OrderConfirmation | undefined>(initialState?.order)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [quoting, setQuoting] = useState(false)
  const [error, setError] = useState("")
  const [quoteError, setQuoteError] = useState("")
  const [notice, setNotice] = useState("")
  const [servicesRemoved, setServicesRemoved] = useState(false)
  const [delivery, setDelivery] = useState(initialState?.selected?.delivery_method ?? "")
  const [services, setServices] = useState<string[]>(initialState?.selected?.services ?? [])
  const [city, setCity] = useState(initialState?.configuration.default_city ?? "")
  const [editContacts, setEditContacts] = useState(false)
  const [savedAddressId, setSavedAddressId] = useState("")
  const savedAddress = customer?.addresses.find((address) => address.id === savedAddressId)
  const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")
  const missingName = !customer?.first_name?.trim()
  const phoneDigits = customer?.phone?.replace(/\D/g, "") ?? ""
  const missingPhone = phoneDigits.length < 10 || phoneDigits.length > 15 || phoneDigits.startsWith("0")
  const [payment, setPayment] = useState<CheckoutInput["payment_preference"]>("cash")
  const form = useRef<HTMLFormElement>(null)
  const quoteVersion = useRef(0)
  const items = state?.cart.items ?? []
  const configuration = state?.configuration
  const money = (amount: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: state!.cart.currency_code.toUpperCase(), maximumFractionDigits: 2 }).format(amount)
  const method = configuration?.delivery_methods.find((candidate) => candidate.id === delivery)
  const required = method?.required_fields ?? []
  const quote = state?.quote
  const subtotal = quote?.items_total ?? items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
  const total = quote?.total ?? subtotal
  const needsConfirmation = method?.pricing !== "fixed"
  const itemVersion = items.map((item) => `${item.id}:${item.quantity}`).join("|")
  const itemCount = items.length
  const unavailableItems = quote?.line_availability?.filter((line) => !line.purchasable || (items.find((item) => item.variant_id === line.variant_id)?.quantity ?? 0) > line.available_quantity) ?? []

  useEffect(() => { queueMicrotask(() => setReady(true)) }, [])

  useEffect(() => {
    let current = true
    queueMicrotask(() => { if (current) { setState(initialState); setOrder(initialState?.order) } })
    return () => { current = false }
  }, [initialState])
  useEffect(() => {
    if (!delivery || !itemCount || order) return
    const version = ++quoteVersion.current
    let current = true
    queueMicrotask(() => { if (current && version === quoteVersion.current) { setQuoting(true); setQuoteError("") } })
    quoteTexnoCart({ delivery_method: delivery, services }).then((result) => {
      if (!current || version !== quoteVersion.current) return
      if (result.error) setQuoteError(result.error)
      else if (result.state) {
        setState(result.state)
        if (result.servicesRemoved) {
          setServices(result.state.selected?.services ?? [])
          setServicesRemoved(true)
        }
      }
    }).catch(() => {
      if (current && version === quoteVersion.current) setQuoteError(connectionError)
    }).finally(() => {
      if (current && version === quoteVersion.current) setQuoting(false)
    })
    return () => { current = false }
  }, [delivery, services, itemVersion, itemCount, order])

  const mutate = async (variantId: string, quantity: number) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      const result = await changeTexnoItem({ variant_id: variantId, quantity, mutation_id: crypto.randomUUID() })
      if (result.error) setError(result.error)
      else if (result.state) {
        setState(result.state)
        setNotice(quantity === 0 ? "Товар удалён из корзины" : "Количество обновлено")
        notifyCartUpdated()
        router.refresh()
      }
    } catch { setError(connectionError) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const clear = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError("")
    try {
      const result = await clearTexnoCart()
      if (result.error) setError(result.error)
      else if ("state" in result) { setState(result.state ?? null); setNotice("Корзина очищена"); notifyCartUpdated(); router.refresh() }
    } catch { setError(connectionError) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busyRef.current || quoting || quoteError || !quote || !delivery || unavailableItems.length) return
    busyRef.current = true
    setBusy(true)
    setError("")
    const data = new FormData(event.currentTarget)
    const field = (name: string) => String(data.get(name) ?? "").trim()
    try {
      const result = await checkoutTexnoCart({ name: field("name"), phone: field("phone"), email: field("email") || undefined, ...(savedAddressId ? { saved_address_id: savedAddressId } : {}), city, delivery_method: delivery,
      address: Object.fromEntries(Object.keys(labels).map((key) => [key, field(`address.${key}`)])), delivery_date: field("delivery_date"), delivery_slot: field("delivery_slot"),
      payment_preference: payment, services, comment: field("comment"), consent: data.get("consent") === "on", expected_total: total })
      if ("error" in result) setError(result.error ?? "Не удалось оформить заказ. Попробуйте ещё раз.")
      else if (result.order) { setOrder(result.order); notifyCartUpdated(); router.refresh(); window.scrollTo({ top: 0, behavior: "instant" }) }
    } catch { setError(connectionError) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const priceLabel = (candidate: NonNullable<typeof method>) => candidate.pricing === "range"
    ? `${money(candidate.min ?? 0)} – ${money(candidate.max ?? 0)}` : candidate.pricing === "unconfirmed" ? "Стоимость уточняется" : candidate.price === 0 ? "Бесплатно" : money(candidate.price ?? 0)

  const savedCartSelector = state?.merge_pending && <div className={styles.error} role="status"><p>Корзины сохранены без потери товаров. {state.merge_pending.message} Уменьшите количество или удалите недоступный товар, затем повторите объединение.</p>{state.merge_pending.carts.map((cart, index) => <button type="button" key={cart.id} data-cart-id={cart.id} disabled={busy} onClick={async () => { if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(""); try { const result = await chooseSavedCart(cart.id); if (result.error) setError(result.error); else if (result.state) { setState(result.state); setDelivery(result.state.selected?.delivery_method ?? ""); setServices(result.state.selected?.services ?? []); router.refresh() } } catch { setError(connectionError) } finally { busyRef.current = false; setBusy(false) } }}>Проверить корзину {index + 1}</button>)}</div>

  if (order) return <section className={`texno-container ${styles.page}`} data-testid="order-confirmation">
    <div className={styles.confirmation}><StoreIcon name="bag" /><p className={styles.eyebrow}>Заказ № {order.display_id}</p><h1>Заказ получен</h1><p>Менеджер свяжется с вами, чтобы подтвердить наличие, доставку и способ оплаты.</p><dl><div><dt>Предварительная сумма</dt><dd>{money(order.total)}</dd></div><div><dt>Оплата</dt><dd>Не оплачен</dd></div></dl>{quote?.requires_confirmation && <p>Стоимость доставки будет рассчитана и согласована отдельно.</p>}<p className={styles.muted}>Номер для обращения: <span data-testid="order-id" data-order-id={order.id}>{order.display_id}</span></p><StoreButton href="/store" fill="blue">Продолжить покупки</StoreButton></div>
  </section>
  if (loadError) return <section className={`texno-container ${styles.page}`}><h1>Корзина</h1><div className={styles.empty}><h2>Не удалось загрузить корзину</h2><p>Проверьте соединение и попробуйте снова. Ваша корзина сохранена.</p><button type="button" onClick={() => router.refresh()} className={`texno-primary-button ${styles.primary}`} data-fill="blue"><span>Повторить</span></button></div></section>
  if (!items.length) return <section className={`texno-container ${styles.page}`} data-testid="empty-cart"><h1>Корзина</h1>{savedCartSelector}{error && <p role="alert">{error}</p>}<div className={styles.empty}><StoreIcon name="bag" /><h2>Здесь пока нет товаров</h2><p>Выберите товары в каталоге.<br />В корзину можно добавить товары с подтверждённым наличием.</p><StoreButton href="/store" fill="blue">Перейти в каталог</StoreButton></div></section>

  return <section className={`texno-container ${styles.page}`}>
    <nav aria-label="Хлебные крошки" className={styles.breadcrumbs}><LocalizedClientLink href="/">Главная</LocalizedClientLink><span>/</span><span>Корзина</span></nav>
    <div className={styles.heading}><h1>Ваша корзина <span>{items.reduce((sum, item) => sum + item.quantity, 0)}</span></h1><LocalizedClientLink href="/store">Продолжить покупки <span aria-hidden="true">↗</span></LocalizedClientLink></div>

    {savedCartSelector}
    <form ref={form} method="post" action={`/${countryCode}/cart/checkout`} onSubmit={submit} className={styles.layout} aria-busy={busy}>
      <div className={styles.content}>
        <div className={styles.listHeading}><h2>Товары</h2><button type="button" onClick={clear} disabled={busy}>Очистить корзину</button></div>
        <section className={styles.items} aria-label="Товары в корзине">{items.map((item) => <article className={styles.item} key={item.id} data-testid="cart-item" data-variant-id={item.variant_id}>
          <LocalizedClientLink href={`/products/${encodeURIComponent(item.product_handle ?? item.product?.handle ?? "")}?v_id=${encodeURIComponent(item.variant_id ?? "")}`} className={styles.image}>{item.thumbnail ? <Image src={item.thumbnail} alt={item.product_title ?? item.title} width={104} height={124} /> : <StoreIcon name="bag" />}</LocalizedClientLink>
          <div className={styles.itemInfo}><LocalizedClientLink href={`/products/${encodeURIComponent(item.product_handle ?? item.product?.handle ?? "")}?v_id=${encodeURIComponent(item.variant_id ?? "")}`} className={styles.itemTitle}>{item.product_title ?? item.title}</LocalizedClientLink><p>{variantLabel(item.variant_title, item.product_title ?? item.title)}</p><p>{money(item.unit_price)} / шт.</p>{unavailableItems.filter((line) => line.variant_id === item.variant_id).map((line) => <p key={line.variant_id} role="status" className={styles.stockWarning}>{line.reason ?? `Доступно ${line.available_quantity} шт. Уменьшите количество.`}</p>)}<button type="button" onClick={() => mutate(item.variant_id!, 0)} disabled={busy} className={styles.remove} aria-label={`Удалить ${item.product_title ?? item.title}`}>Удалить</button></div>
          <div className={styles.itemActions}><strong data-testid="cart-line-total">{money(item.unit_price * item.quantity)}</strong><div className={styles.quantity} aria-label={`Количество ${item.product_title ?? item.title}`}><button type="button" disabled={busy || item.quantity <= 1} onClick={() => mutate(item.variant_id!, item.quantity - 1)} aria-label="Уменьшить количество">−</button><output aria-label="Количество" data-testid="cart-line-quantity">{item.quantity}</output><button type="button" disabled={busy || (quote?.line_availability?.some((line) => line.variant_id === item.variant_id && (!line.purchasable || item.quantity >= line.available_quantity)) ?? false)} onClick={() => mutate(item.variant_id!, item.quantity + 1)} aria-label="Увеличить количество">+</button></div></div>
        </article>)}</section>
        <section className={styles.section} aria-labelledby="cart-contact-title"><div className={styles.sectionHeading}><span>01</span><h2 id="cart-contact-title">Контактные данные</h2></div>
        {customer && <div className={styles.contactSummary} data-testid="checkout-contact-summary"><p>{customerName}</p><p>{customer.phone}</p><p>{customer.email}</p><button type="button" className="texno-text-link" onClick={() => setEditContacts((value) => !value)}>{editContacts ? "Использовать данные профиля" : "Изменить для этого заказа"}</button>{(missingName || missingPhone) && <p className={styles.muted}>Дополните недостающие данные — они сохранятся в вашем профиле.</p>}</div>}
        <div className={styles.fields}>
          {(!customer || editContacts || missingName) && <label>Имя <span>*</span><input name="name" autoComplete="name" required maxLength={100} defaultValue={missingName ? "" : customerName} placeholder="Как к вам обращаться" /></label>}
          {(!customer || editContacts || missingPhone) && <label>Телефон <span>*</span><input name="phone" type="tel" autoComplete="tel" required minLength={10} maxLength={24} defaultValue={customer?.phone ?? ""} placeholder="+7 (999) 000-00-00" /></label>}
          {(!customer || editContacts) && <label className={styles.wide}>Электронная почта <em>необязательно</em><input name="email" type="email" autoComplete="email" maxLength={254} defaultValue={customer?.email ?? ""} placeholder="Для информации о заказе" /></label>}
        </div></section>
        <section className={styles.section} aria-labelledby="cart-delivery-title"><div className={styles.sectionHeading}><span>02</span><h2 id="cart-delivery-title">Получение заказа</h2></div><div className={styles.fields}><label className={styles.wide}>Город <span>*</span><input name="city" autoComplete="address-level2" required value={city} readOnly={Boolean(savedAddress)} onChange={(event) => setCity(event.target.value)} maxLength={100} /></label></div>
          {!!customer?.addresses.length && <div className={styles.fields}><label className={styles.wide}>Адрес из профиля<select value={savedAddressId} onChange={(event) => { setSavedAddressId(event.target.value); const address = customer.addresses.find((item) => item.id === event.target.value); if (address?.city) setCity(address.city) }}><option value="">Указать другой адрес</option>{customer.addresses.filter((address) => address.address_1).map((address) => <option value={address.id} key={address.id}>{[address.city, address.address_1, address.address_2].filter(Boolean).join(", ")}</option>)}</select></label>{savedAddress && <p className={styles.muted}>{[savedAddress.city, savedAddress.address_1, savedAddress.address_2].filter(Boolean).join(", ")}</p>}</div>}
          <fieldset className={styles.options}><legend className={styles.srOnly}>Способ получения</legend>{configuration?.delivery_methods.map((candidate) => <label className={styles.option} key={candidate.id} data-selected={delivery === candidate.id}><input type="radio" name="delivery_method" required value={candidate.id} checked={delivery === candidate.id} onChange={() => setDelivery(candidate.id)} disabled={busy} /><span><strong>{candidate.label}</strong>{candidate.pricing !== "fixed" && <small>Точную стоимость подтвердит менеджер</small>}</span><b>{priceLabel(candidate)}</b></label>)}</fieldset>
          {method && <><div className={styles.fields}>{Array.from(new Set([...(required.includes("street") || required.includes("house") ? ["street", "metro", "house", "building", "entrance", "apartment", "intercom", "floor"] : []), ...required])).filter((key) => key in labels && (key !== "metro" || required.includes("metro")) && (!savedAddress || (!["street", "house"].includes(key) && !(key === "apartment" && savedAddress.address_2) && !(key === "postal_code" && savedAddress.postal_code)))).map((key) => <label key={key}>{labels[key]} {required.includes(key) && <span>*</span>}<input name={`address.${key}`} required={required.includes(key)} maxLength={160} autoComplete={key === "street" ? "address-line1" : "off"} /></label>)}</div>
          <p className={styles.muted}>{required.includes("pickup") ? "Укажите удобный пункт. Адрес и возможность выдачи подтвердит менеджер." : "Дата и интервал — ваши пожелания. Доставка возможна после подтверждения менеджером."}</p>
          <div className={styles.fields}><label>Желаемая дата <span>*</span><input type="date" name="delivery_date" required min={dateToday(configuration?.time_zone)} /></label><label>Время получения <span>*</span><select name="delivery_slot" required defaultValue=""><option value="" disabled>Выберите интервал</option>{configuration?.delivery_slots?.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label></div></>}
        </section>
        <section className={styles.section} aria-labelledby="cart-payment-title"><div className={styles.sectionHeading}><span>03</span><h2 id="cart-payment-title">Способ оплаты</h2></div><fieldset className={styles.options}><legend className={styles.srOnly}>Предпочтительный способ оплаты</legend><label className={styles.option} data-selected={payment === "cash"}><input type="radio" name="payment" checked={payment === "cash"} onChange={() => setPayment("cash")} /><span><strong>Наличными при получении</strong><small>После получения и проверки товара</small></span></label><label className={styles.option} data-selected={payment === "card_on_receipt"}><input type="radio" name="payment" checked={payment === "card_on_receipt"} onChange={() => setPayment("card_on_receipt")} /><span><strong>Банковской картой</strong><small>Возможность оплаты уточнит менеджер</small></span></label></fieldset><p className={styles.muted}>Сейчас вы отправляете заказ без оплаты на сайте.</p></section>
        <section className={styles.section} aria-label="Услуги и комментарий">{Boolean(configuration?.services.length) && <><div className={styles.sectionHeading}><span>04</span><h2 id="cart-services-title">Дополнительные услуги</h2></div><p className={styles.muted}>Добавьте только то, что вам нужно.</p><div className={styles.options}>{configuration?.services.map((service) => <label className={styles.option} key={service.id}><input type="checkbox" name="services" value={service.id} checked={services.includes(service.id)} disabled={busy} onChange={(event) => setServices((current) => event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id))} /><span>{service.label}</span><b>{money(service.price)}</b></label>)}</div></>}<label className={styles.comment}>Комментарий <em>необязательно</em><textarea name="comment" maxLength={2000} rows={3} placeholder="Что нам нужно учесть при подготовке заказа?" /></label></section>
      </div>
      <aside className={styles.summary} aria-labelledby="cart-summary-title"><h2 id="cart-summary-title">Ваш заказ</h2><dl><div><dt>Товары · {items.reduce((sum, item) => sum + item.quantity, 0)} шт.</dt><dd>{money(subtotal)}</dd></div><div><dt>Дополнительные услуги</dt><dd>{money(quote?.services_total ?? 0)}</dd></div><div><dt>Доставка</dt><dd>{method ? priceLabel(method) : "Выберите способ"}</dd></div></dl><div className={styles.total} aria-live="polite"><span>{needsConfirmation || !method ? "Предварительно" : "Итого"}</span><strong data-testid="cart-total">{money(total)}</strong></div>{needsConfirmation && method && <p className={styles.muted}>Стоимость доставки уточняется и будет согласована отдельно.</p>}
        <label className={styles.consent}><input type="checkbox" name="consent" required /><span>{documents.offer ? <>Я принимаю <a href={documents.offer} target="_blank" rel="noopener noreferrer">условия оферты</a> и даю </> : "Даю "}{documents.consent ? <a href={documents.consent} target="_blank" rel="noopener noreferrer">согласие на обработку персональных данных</a> : "согласие на обработку персональных данных"}{documents.privacy ? <> согласно <a href={documents.privacy} target="_blank" rel="noopener noreferrer">политике конфиденциальности</a></> : null}.</span></label>
        {unavailableItems.length > 0 && <p className={styles.stockWarning}>Проверьте наличие товаров: уменьшите количество или удалите недоступные позиции.</p>}
        <button type="submit" className={`texno-primary-button ${styles.primary}`} data-fill="blue" disabled={!ready || busy || quoting || !!quoteError || !delivery || !quote || unavailableItems.length > 0} data-testid="checkout-submit"><span>{busy ? "Подождите…" : quoting ? "Рассчитываем…" : "Оформить заказ"}</span></button><noscript><p className={styles.error}>Для оформления заказа включите JavaScript в браузере.</p></noscript><p className={styles.summaryNote}>Без списания средств.<br />Подтверждение заказа — по телефону.</p>
        {servicesRemoved && <p className={styles.muted} role="status">Недоступные услуги убраны. Сумма пересчитана.</p>}
        {(error || quoteError) && <div className={styles.error} role="alert">{error || quoteError}<button type="button" onClick={() => { setError(""); setQuoteError(""); setServices((current) => [...current]) }}>Обновить расчёт</button></div>}
      </aside>
    </form><p className={styles.srOnly} role="status">{notice}</p>
  </section>
}
