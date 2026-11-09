"use client"

import { Plus } from "@medusajs/icons"
import { Button, Heading } from "@modules/common/components/ui"
import { useActionState, useEffect, useState } from "react"

import { addCustomerAddress } from "@lib/data/customer"
import useToggleState from "@lib/hooks/use-toggle-state"
import { HttpTypes } from "@medusajs/types"
import CountrySelect from "@modules/checkout/components/country-select"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { useRouter } from "next/navigation"
import Modal from "@modules/common/components/modal"
import { safeAccountAction } from "../../lib/actions"

const AddAddress = ({
  region,
  addresses,
}: {
  region: HttpTypes.StoreRegion
  addresses: HttpTypes.StoreCustomerAddress[]
}) => {
  const [successState, setSuccessState] = useState(false)
  const router = useRouter()
  const { state, open, close: closeModal } = useToggleState(false)

  const [formState, formAction] = useActionState(safeAccountAction(addCustomerAddress, { success: false, error: "Связь прервалась. Обновите адреса перед повторным сохранением." }), {
    success: false,
    error: null,
  } as { success: boolean; error: string | null })

  const close = () => {
    setSuccessState(false)
    closeModal()
  }

  useEffect(() => {
    if (successState) {
      close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successState])

  useEffect(() => {
    if (formState.success) {
      setSuccessState(true)
      router.refresh()
    }
  }, [formState, router])

  return (
    <>
      <button
        type="button"
        className="border border-ui-border-base rounded-rounded p-5 min-h-[220px] h-full w-full flex flex-col justify-between"
        onClick={open}
        data-testid="add-address-button"
      >
        <span className="text-base-semi">Добавить адрес</span>
        <Plus />
      </button>

      <Modal isOpen={state} close={close} data-testid="add-address-modal">
        <Modal.Title>
          <Heading className="mb-2">Новый адрес</Heading>
        </Modal.Title>
        <form action={formAction} className="min-h-0 flex flex-1 flex-col">
          <Modal.Body>
            <div className="flex flex-col w-full gap-y-3">
              <Input
                label="Улица и номер дома"
                name="address_1"
                required
                autoComplete="address-line1"
                data-testid="address-1-input"
              />
              <Input
                label="Квартира, подъезд, этаж"
                name="address_2"
                autoComplete="address-line2"
                data-testid="address-2-input"
              />
              <Input
                label="Город"
                name="city"
                required
                autoComplete="locality"
                data-testid="city-input"
              />
              <Input
                label="Область или регион"
                name="province"
                autoComplete="address-level1"
                data-testid="state-input"
              />
              <CountrySelect aria-label="Страна" placeholder="Страна"
                defaultValue={region.countries?.[0]?.iso_2}
                region={region}
                name="country_code"
                required
                autoComplete="country"
                data-testid="country-select"
              />
              <label className="flex items-center gap-3 text-sm min-h-11"><input type="checkbox" name="is_default_shipping" defaultChecked={!addresses.some((address) => address.is_default_shipping)} />Адрес доставки по умолчанию</label>
            </div>
            {formState.error && (
              <div
                className="text-rose-500 text-small-regular py-2"
                data-testid="address-error"
              >
                {formState.error}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <div className="flex gap-3 mt-6">
              <Button
                type="reset"
                variant="secondary"
                onClick={close}
                className="h-10"
                data-testid="cancel-button"
              >
                Отмена
              </Button>
              <SubmitButton data-testid="save-button">Сохранить</SubmitButton>
            </div>
          </Modal.Footer>
        </form>
      </Modal>
    </>
  )
}

export default AddAddress
