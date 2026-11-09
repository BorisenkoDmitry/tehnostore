"use client"
import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { login, type CustomerAuthState } from "@lib/data/customer"
import { safeAccountAction } from "../../lib/actions"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"

const Login = ({ setCurrentView }: { setCurrentView: (view: LOGIN_VIEW) => void }) => {
  const [message, formAction] = useActionState(safeAccountAction(login, { state: "error", error: "Связь прервалась. Проверьте интернет и повторите вход." } as CustomerAuthState), null)
  const router = useRouter()
  useEffect(() => { if (message?.state === "success") router.refresh() }, [message, router])
  return <div className="w-full" data-testid="login-page">
    <h1 className="mb-5">Вход в личный кабинет</h1>
    <p className="mb-8 leading-relaxed text-ui-fg-subtle">Ваши заказы, контакты и адреса доставки — в одном месте.</p>
    {message?.state === "verification_required" && <p role="status" className="mb-5 text-sm" data-testid="login-verification-message">Для аккаунта {message.email} требуется подтверждение email. Обратитесь в магазин.</p>}
    <form action={formAction} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" autoComplete="email" maxLength={254} required data-testid="email-input" />
      <Input label="Пароль" name="password" type="password" autoComplete="current-password" maxLength={256} required data-testid="password-input" />
      {message?.state === "error" && <p role="alert" className="text-red-700 text-sm" data-testid="login-error-message">{message.error}</p>}
      <SubmitButton className="w-full mt-2" data-testid="sign-in-button">Войти</SubmitButton>
    </form>
    <p className="mt-6 text-sm">Ещё нет аккаунта? <button type="button" onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)} className="underline underline-offset-4 min-h-11" data-testid="register-button">Зарегистрироваться</button></p>
  </div>
}
export default Login
