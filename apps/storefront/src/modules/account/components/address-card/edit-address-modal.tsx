"use client"

import {
  deleteCustomerAddress,
  updateCustomerAddress,
} from "@lib/data/customer"
import useToggleState from "@lib/hooks/use-toggle-state"
import { PencilSquare as Edit, Trash } from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import CountrySelect from "@modules/checkout/components/country-select"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import Input from "@modules/common/components/input"
import { useRouter } from "next/navigation"
import Modal from "@modules/common/components/modal"
import { safeAccountAction } from "../../lib/actions"
import { Button, Heading, Text, clx } from "@modules/common/components/ui"
import Spinner from "@modules/common/icons/spinner"
import React, { useActionState, useEffect, useState } from "react"

type EditAddressProps = {
  region: HttpTypes.StoreRegion
  address: HttpTypes.StoreCustomerAddress
  isActive?: boolean
}

const EditAddress: React.FC<EditAddressProps> = ({
  region,
  address,
  isActive = false,
}) => {
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState("")
  const [successState, setSuccessState] = useState(false)
  const router = useRouter()
  const { state, open, close: closeModal } = useToggleState(false)

  const [formState, formAction] = useActionState(safeAccountAction(updateCustomerAddress, { success: false, error: "Связь прервалась. Проверьте интернет и повторите сохранение." }), {
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

  const removeAddress = async () => {
    setRemoving(true)
    setRemoveError("")
    try { await deleteCustomerAddress(address.id); router.refresh() } catch { setRemoveError("Не удалось удалить адрес. Повторите попытку.") } finally { setRemoving(false) }
  }

  return (
    <>
      <div
        className={clx(
          "border rounded-rounded p-5 min-h-[220px] h-full w-full flex flex-col justify-between transition-colors",
          {
            "border-gray-900": isActive,
          }
        )}
        data-testid="address-container"
      >
        <div className="flex flex-col">
          <Heading
            className="text-left text-base-semi"
            data-testid="address-address"
          >
            {address.address_1}
            {address.address_2 && <span>, {address.address_2}</span>}
          </Heading>
          {address.is_default_shipping && <Text className="text-sm text-ui-fg-subtle mb-2">Для доставки по умолчанию</Text>}
          <Text className="flex flex-col text-left text-base-regular mt-2">
            <span data-testid="address-city">
              {address.city}
            </span>
            <span data-testid="address-province-country">
              {address.province && `${address.province}, `}
              {address.country_code?.toUpperCase()}
            </span>
          </Text>
        </div>
        <div className="flex items-center gap-x-4">
          <button
            type="button"
            className="text-small-regular text-ui-fg-base flex items-center gap-x-2"
            onClick={open}
            data-testid="address-edit-button"
          >
            <Edit />
            Изменить
          </button>
          <button
            type="button"
            disabled={removing}
            className="text-small-regular text-ui-fg-base flex items-center gap-x-2"
            onClick={removeAddress}
            data-testid="address-delete-button"
          >
            {removing ? <Spinner /> : <Trash />}
            Удалить
          </button>
        </div>
        {removeError && <p role="alert" className="text-red-700 text-sm mt-3">{removeError}</p>}
      </div>

      <Modal isOpen={state} close={close} data-testid="edit-address-modal">
        <Modal.Title>
          <Heading className="mb-2">Изменить адрес</Heading>
        </Modal.Title>
        <form action={formAction} className="min-h-0 flex flex-1 flex-col">
          <input type="hidden" name="addressId" value={address.id} />
          <Modal.Body>
            <div className="grid grid-cols-1 w-full gap-y-3">
              <Input
                label="Улица и номер дома"
                name="address_1"
                required
                autoComplete="address-line1"
                defaultValue={address.address_1 || undefined}
                data-testid="address-1-input"
              />
              <Input
                label="Квартира, подъезд, этаж"
                name="address_2"
                autoComplete="address-line2"
                defaultValue={address.address_2 || undefined}
                data-testid="address-2-input"
              />
              <Input
                label="Город"
                name="city"
                required
                autoComplete="locality"
                defaultValue={address.city || undefined}
                data-testid="city-input"
              />
              <Input
                label="Область или регион"
                name="province"
                autoComplete="address-level1"
                defaultValue={address.province || undefined}
                data-testid="state-input"
              />
              <CountrySelect aria-label="Страна" placeholder="Страна"
                name="country_code"
                region={region}
                required
                autoComplete="country"
                defaultValue={address.country_code || undefined}
                data-testid="country-select"
              />
              <input type="hidden" name="shipping_default_control" value="true" />
              <label className="flex items-center gap-3 text-sm min-h-11"><input type="checkbox" name="is_default_shipping" defaultChecked={address.is_default_shipping} />Адрес доставки по умолчанию</label>
            </div>
            {formState.error && (
              <div className="text-rose-500 text-small-regular py-2">
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

export default EditAddress
