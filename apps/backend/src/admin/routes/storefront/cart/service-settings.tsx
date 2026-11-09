import { useRegionPermissions } from "@medusajs/dashboard/hooks"
import { EllipsisHorizontal, Plus } from "@medusajs/icons"
import { Badge, Button, Container, Drawer, DropdownMenu, FocusModal, Heading, IconButton, Input, Label, Switch, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import type { CheckoutServicesInput, CheckoutSettingsInput } from "../../../../api/admin/checkout-settings/validators"
import { sdk } from "../../../lib/sdk"

type Service = CheckoutServicesInput["services"][number]
type Settings = { configuration: CheckoutSettingsInput; currency_code: string }
const settingsKey = ["checkout-settings"] as const

function ServiceFields({ service }: { service: Service }) {
  return <div className="grid gap-4">
    <div className="grid gap-1.5">
      <Label htmlFor="service-name">Название</Label>
      <Input id="service-name" name="label" defaultValue={service.label} minLength={2} maxLength={200} required />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="service-price">Стоимость</Label>
        <Input id="service-price" name="price" type="number" min={0} max={1000000} step="0.01" defaultValue={service.price} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="service-order">Порядок показа</Label>
        <Input id="service-order" name="order" type="number" min={0} max={999} defaultValue={service.order} required />
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="service-enabled" name="enabled" defaultChecked={service.enabled} />
      <Label htmlFor="service-enabled">Показывать в корзине</Label>
    </div>
  </div>
}

export function ServiceSettings() {
  const client = useQueryClient()
  const prompt = usePrompt()
  const { canUpdate } = useRegionPermissions()
  const [editor, setEditor] = useState<{ service: Service; create: boolean; revision: number }>()
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: () => sdk.client.fetch<Settings>("/admin/checkout-settings"),
  })
  const configuration = settings.data?.configuration
  const services = configuration?.services ?? []
  const save = useMutation({
    mutationFn: ({ input }: { input: CheckoutServicesInput; message: string }) =>
      sdk.client.fetch<CheckoutServicesInput>("/admin/checkout-settings/services", { method: "POST", body: input }),
    onSuccess: async (result, { message }) => {
      client.setQueryData<Settings>(settingsKey, (current) => {
        if (!current || current.configuration.expected_revision > result.expected_revision) return current
        return { ...current, configuration: { ...current.configuration, ...result } }
      })
      setEditor(undefined)
      await client.invalidateQueries({ queryKey: settingsKey })
      toast.success(message)
    },
    onError: (error: Error & { status?: number }) => {
      toast.error("Не удалось сохранить услуги", { description: error.message })
      if (error.status === 409) {
        setEditor(undefined)
        void client.invalidateQueries({ queryKey: settingsKey })
      }
    },
  })
  const currency = new Intl.NumberFormat("ru-RU", {
    style: "currency", currency: settings.data?.currency_code.toUpperCase() ?? "RUB",
  })

  function createService() {
    if (!configuration) return
    const order = Math.min(999, Math.max(-1, ...services.map((service) => service.order)) + 1)
    setEditor({ create: true, revision: configuration.expected_revision,
      service: { id: `service_${crypto.randomUUID().replace(/-/g, "")}`, label: "", price: 0, order, enabled: true },
    })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || !configuration || save.isPending) return
    const fields = new FormData(event.currentTarget)
    const service = {
      ...editor.service,
      label: String(fields.get("label") ?? "").trim(),
      price: Number(fields.get("price")),
      order: Number(fields.get("order")),
      enabled: fields.has("enabled"),
    }
    if (service.label.length < 2) {
      toast.error("Укажите название услуги")
      return
    }
    save.mutate({
      input: { expected_revision: editor.revision, services: editor.create ? [...services, service] : services.map((item) => item.id === service.id ? service : item) },
      message: editor.create ? "Услуга добавлена" : "Услуга сохранена",
    })
  }

  async function remove(service: Service) {
    if (!configuration || save.isPending) return
    const confirmed = await prompt({
      title: `Удалить услугу «${service.label}»?`,
      description: "Услуга исчезнет из корзины. В оформленных заказах сохранятся её название и цена.",
      confirmText: "Удалить", cancelText: "Отмена",
      variant: "danger",
    })
    if (!confirmed) return
    save.mutate({
      input: { expected_revision: configuration.expected_revision, services: services.filter((item) => item.id !== service.id) },
      message: "Услуга удалена",
    })
  }

  function closeEditor() {
    if (!save.isPending) setEditor(undefined)
  }

  return <Container className="divide-y p-0">
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div>
        <Heading>Дополнительные услуги</Heading>
        <Text size="small" className="text-ui-fg-subtle">Услуги, которые покупатель может добавить к заказу в корзине.</Text>
      </div>
      {canUpdate && <Button size="small" disabled={!configuration || settings.isError || services.length >= 50 || save.isPending} onClick={createService}>
        <Plus />Добавить услугу
      </Button>}
    </div>
    {settings.isPending ? <Text className="px-6 py-4" role="status">Загрузка услуг…</Text>
      : settings.isError ? <div className="flex flex-wrap items-center gap-3 px-6 py-4">
        <Text role="alert">Не удалось загрузить услуги.</Text><Button size="small" variant="secondary" onClick={() => settings.refetch()}>Повторить</Button>
      </div>
      : !services.length ? <Text className="px-6 py-8 text-ui-fg-subtle">Дополнительных услуг пока нет.</Text>
      : <div className="overflow-x-auto">
        <Table>
          <Table.Header><Table.Row>
            <Table.HeaderCell>Услуга</Table.HeaderCell>
            <Table.HeaderCell>Стоимость</Table.HeaderCell>
            <Table.HeaderCell>Порядок</Table.HeaderCell>
            <Table.HeaderCell>В корзине</Table.HeaderCell>
            {canUpdate && <Table.HeaderCell><span className="sr-only">Действия</span></Table.HeaderCell>}
          </Table.Row></Table.Header>
          <Table.Body>{[...services].sort((a, b) => a.order - b.order).map((service) => <Table.Row key={service.id}>
            <Table.Cell className="font-medium">{service.label}</Table.Cell>
            <Table.Cell className="whitespace-nowrap">{currency.format(service.price)}</Table.Cell>
            <Table.Cell>{service.order}</Table.Cell>
            <Table.Cell><Badge color={service.enabled ? "green" : "grey"}>{service.enabled ? "Показывается" : "Скрыта"}</Badge></Table.Cell>
            {canUpdate && configuration && <Table.Cell className="text-right">
              <DropdownMenu>
                <DropdownMenu.Trigger asChild><IconButton size="small" variant="transparent" aria-label={`Действия: ${service.label}`} disabled={save.isPending}><EllipsisHorizontal /></IconButton></DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Item onSelect={() => setEditor({ service, create: false, revision: configuration.expected_revision })}>Редактировать</DropdownMenu.Item>
                  <DropdownMenu.Item className="text-ui-fg-error" onSelect={() => void remove(service)}>Удалить</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            </Table.Cell>}
          </Table.Row>)}</Table.Body>
        </Table>
      </div>}
    {editor?.create && <FocusModal open onOpenChange={(open) => { if (!open) closeEditor() }}>
      <FocusModal.Content>
        <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
          <FocusModal.Header><Button type="submit" size="small" isLoading={save.isPending}>Добавить</Button></FocusModal.Header>
          <FocusModal.Body className="overflow-y-auto">
            <div className="mx-auto grid max-w-xl gap-6 p-6">
              <FocusModal.Title>Добавить услугу</FocusModal.Title>
              <FocusModal.Description className="sr-only">Укажите, как услуга будет показана в корзине.</FocusModal.Description>
              <ServiceFields service={editor.service} />
            </div>
          </FocusModal.Body>
        </form>
      </FocusModal.Content>
    </FocusModal>}
    {editor && !editor.create && <Drawer open onOpenChange={(open) => { if (!open) closeEditor() }}>
      <Drawer.Content>
        <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
          <Drawer.Header><Drawer.Title>Редактировать услугу</Drawer.Title>
            <Drawer.Description className="sr-only">Измените параметры услуги в корзине.</Drawer.Description></Drawer.Header>
          <Drawer.Body className="overflow-y-auto"><ServiceFields service={editor.service} /></Drawer.Body>
          <Drawer.Footer><Button size="small" variant="secondary" type="button" onClick={closeEditor}>Отмена</Button>
            <Button type="submit" size="small" isLoading={save.isPending}>Сохранить</Button></Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>}
  </Container>
}

