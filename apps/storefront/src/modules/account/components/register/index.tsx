"use client"
import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signup, type CustomerAuthState } from "@lib/data/customer"
import { safeAccountAction } from "../../lib/actions"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"

const Register = ({ setCurrentView, consentUrl, termsUrl }: { setCurrentView: (view: LOGIN_VIEW) => void; consentUrl?: string; termsUrl?: string }) => {
  const [message, formAction] = useActionState(safeAccountAction(signup, { state: "error", error: "Связь прервалась. Повторите попытку. Если аккаунт уже создан, войдите с указанными данными." } as CustomerAuthState), null)
  const router = useRouter()
  useEffect(() => { if (message?.state === "success") router.refresh() }, [message, router])
  return <div className="w-full" data-testid="register-page">
    <h1 className="mb-5">Создать аккаунт</h1>
    <p className="mb-7 leading-relaxed text-ui-fg-subtle">Сохраняйте адреса доставки и смотрите свои заказы.</p>
    {message?.state === "verification_required" && <p role="status" className="mb-5 text-sm" data-testid="register-verification-message">Для аккаунта {message.email} требуется подтверждение email. Обратитесь в магазин.</p>}
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3"><Input label="Имя" name="first_name" autoComplete="given-name" required maxLength={100} data-testid="first-name-input" /><Input label="Фамилия" name="last_name" autoComplete="family-name" required maxLength={100} data-testid="last-name-input" /></div>
      <Input label="Email" name="email" type="email" autoComplete="email" required maxLength={254} data-testid="email-input" />
      <Input label="Телефон" name="phone" type="tel" autoComplete="tel" maxLength={30} data-testid="phone-input" />
      <div><Input label="Пароль" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} data-testid="password-input" /><p className="text-sm text-ui-fg-subtle mt-2">От 8 символов</p></div>
      <label className="flex items-start gap-3 text-sm leading-relaxed py-2">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 shrink-0" />
        <span>
          Согласен на {consentUrl ? <Link href={consentUrl} className="underline underline-offset-2">обработку персональных данных</Link> : "обработку персональных данных"}
          {termsUrl && <> и принимаю <Link href={termsUrl} className="underline underline-offset-2">условия использования</Link></>}.
        </span>
      </label>
      {message?.state === "error" && <p role="alert" className="text-red-700 text-sm" data-testid="register-error">{message.error}</p>}
      <SubmitButton className="w-full" data-testid="register-button">Зарегистрироваться</SubmitButton>
    </form>
    <p className="mt-6 text-sm">Уже есть аккаунт? <button type="button" onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)} className="underline underline-offset-4 min-h-11">Войти</button></p>
  </div>
}
export default Register
