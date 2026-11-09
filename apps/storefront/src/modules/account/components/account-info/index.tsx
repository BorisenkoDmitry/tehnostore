import { useFormStatus } from "react-dom"
import { useEffect, useState } from "react"
import { Button } from "@modules/common/components/ui"

type Props = { label: string; currentInfo: React.ReactNode; isSuccess?: boolean; isError?: boolean; errorMessage?: string; clearState: () => void; children?: React.ReactNode; "data-testid"?: string }

const AccountInfo = ({ label, currentInfo, isSuccess, isError, errorMessage = "Не удалось сохранить данные. Повторите попытку.", clearState, children, "data-testid": testId }: Props) => {
  const [open, setOpen] = useState(false)
  const { pending } = useFormStatus()
  useEffect(() => { if (isSuccess) setOpen(false) }, [isSuccess])
  return <section className="text-base" data-testid={testId}>
    <div className="flex items-start justify-between gap-5">
      <div className="min-w-0"><h2 className="text-sm text-ui-fg-subtle mb-2">{label}</h2><div className="break-words font-medium" data-testid="current-info">{currentInfo || "Не указано"}</div></div>
      <Button variant="secondary" type="button" className="min-h-11 shrink-0 px-4" disabled={pending} aria-expanded={open} onClick={() => { clearState(); setOpen(!open) }} data-testid="edit-button" data-active={open}>{open ? "Отмена" : "Изменить"}</Button>
    </div>
    {isSuccess && !open && <p role="status" className="text-green-800 mt-4 text-sm" data-testid="success-message">Данные сохранены</p>}
    {open && <div className="flex flex-col gap-4 pt-5">
      {children}
      {isError && <p role="alert" className="text-red-700 text-sm" data-testid="error-message">{errorMessage}</p>}
      <Button isLoading={pending} className="self-start min-h-11 px-5" type="submit" data-testid="save-button">Сохранить</Button>
    </div>}
  </section>
}
export default AccountInfo
