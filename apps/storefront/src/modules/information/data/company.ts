export const company = {
  name: "ООО «АУРА»",
  inn: "6154168886",
  kpp: "615401001",
  ogrn: "1256100002377",
  address:
    "347924, Ростовская область, г Таганрог, Зои Космодемьянской ул, д. 2, кв. 84",
  email: "help@texno-sale.ru",
} as const

export const companyDetails = `${company.name}
ИНН/КПП: ${company.inn}/${company.kpp}
ОГРН: ${company.ogrn}
Юридический адрес: ${company.address}
Электронная почта для обращений: ${company.email}`
