"use client"

import { useRef, useState, type FormEvent, type SyntheticEvent } from "react"
import { submitContactRequest } from "@lib/data/contact"
import styles from "./contacts.module.css"

export default function EmailForm({ contactEmail, documents }: { contactEmail: string; documents: { privacy?: string; consent?: string } }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [errors, setErrors] = useState({ email: "", message: "" })
  const messageField = useRef<HTMLTextAreaElement>(null)
  const requestKey = useRef("")
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const busyRef = useRef(false)

  async function openEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    if (!message.trim()) {
      setErrors((current) => ({ ...current, message: "Напишите, с каким вопросом вы обращаетесь." }))
      messageField.current?.focus()
      return
    }
    if (!requestKey.current) requestKey.current = crypto.randomUUID()
    const website = String(new FormData(event.currentTarget).get("website") ?? "")
    busyRef.current = true
    setBusy(true)
    setStatus("")
    try {
      const result = await submitContactRequest({ request_key: requestKey.current, name, email, message, consent, website })
      if (result.error) setStatus(result.error)
      else { setStatus("Обращение сохранено. Сотрудник магазина сможет увидеть его и связаться с вами по указанному email."); setMessage(""); requestKey.current = "" }
    } catch { setStatus("Нет связи с магазином. Попробуйте ещё раз.") }
    finally { busyRef.current = false; setBusy(false) }
  }

  function showEmailError(event: SyntheticEvent<HTMLInputElement>) {
    const input = event.currentTarget
    setErrors((current) => ({ ...current, email: input.validity.valid ? "" : input.validity.valueMissing ? "Укажите email для ответа." : "Введите email в формате name@example.ru." }))
  }

  function showMessageError() {
    setErrors((current) => ({ ...current, message: message.trim() ? "" : "Напишите, с каким вопросом вы обращаетесь." }))
  }

  return (
    <form
      method="post"
      onSubmit={openEmail}
      className={styles.form}
      aria-describedby="contacts-form-note"
    >
      <div className="sr-only" aria-hidden="true"><label>Сайт<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className={styles.formIntro}>Укажите имя, email для ответа и ваш вопрос.</p>
      <div className={styles.field}><label htmlFor="contacts-name">Ваше имя</label><input id="contacts-name" type="text" autoComplete="name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></div>
      <div className={styles.field}>
        <label htmlFor="contacts-email">Ваш email</label>
        <input
          id="contacts-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          placeholder="name@example.ru"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "contacts-email-error" : undefined}
          onInvalid={showEmailError}
          onBlur={showEmailError}
          onChange={(event) => {
            setEmail(event.target.value)
            setErrors((current) => ({ ...current, email: "" }))
          }}
        />
        {errors.email && <p id="contacts-email-error" className={styles.fieldError} role="status">{errors.email}</p>}
      </div>
      <div className={styles.field}>
        <label htmlFor="contacts-message">Ваше сообщение</label>
        <textarea
          ref={messageField}
          id="contacts-message"
          rows={5}
          required
          maxLength={2000}
          value={message}
          placeholder="Чем можем помочь?"
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? "contacts-message-error" : undefined}
          onInvalid={showMessageError}
          onBlur={showMessageError}
          onChange={(event) => {
            setMessage(event.target.value)
            setErrors((current) => ({ ...current, message: "" }))
          }}
        />
        {errors.message && <p id="contacts-message-error" className={styles.fieldError} role="status">{errors.message}</p>}
      </div>
      <label className={styles.formNote}><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Даю {documents.consent ? <a href={documents.consent}>согласие на обработку персональных данных</a> : "согласие на обработку персональных данных"}{documents.privacy ? <> в соответствии с <a href={documents.privacy}>политикой конфиденциальности</a></> : null}.</label>
      <p id="contacts-form-note" className={styles.formNote}>Обращение будет сохранено для сотрудников магазина.</p>
      <button type="submit" disabled={busy} className={`texno-primary-button ${styles.emailButton}`} data-fill="blue">
        <span>{busy ? "Сохраняем…" : "Отправить обращение"}</span>
      </button>
      {status && <p role="status" aria-live="polite" className={styles.formNote}>{status}</p>}
      <noscript><p>Для отправки формы включите JavaScript или напишите на email магазина.</p></noscript>
      <p className={styles.formNote}>
        Также можно написать напрямую: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </form>
  )
}
