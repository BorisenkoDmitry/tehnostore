// The contacts source uses info@texno.store; About keeps its own source email.
export const contacts = {
  email: "info@texno.store",
  phone: "+7 (495) 104-59-90",
  phoneUri: "+74951045990",
  departments: [
    {
      name: "Отдел продаж",
      extension: "1",
      weekdays: "09:00–21:00",
      weekend: "10:00–19:00",
    },
    {
      name: "Служба контроля качества",
      extension: "2",
      weekdays: "11:00–19:00",
      weekend: "Выходной",
    },
    {
      name: "Отдел сотрудничества и оптовых закупок",
      extension: "3",
      weekdays: "10:00–20:00",
      weekend: "Выходной",
    },
  ],
} as const
