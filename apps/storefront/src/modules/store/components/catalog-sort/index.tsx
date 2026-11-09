"use client"

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react"

const options = [
  { value: "featured", label: "По умолчанию" },
  { value: "title_asc", label: "По названию: А–Я" },
  { value: "title_desc", label: "По названию: Я–А" },
  { value: "price_asc", label: "Сначала дешевле" },
  { value: "price_desc", label: "Сначала дороже" },
]

export default function CatalogSort({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = options.find((option) => option.value === value) ?? options[0]
  return <div className="texno-store-sort">
    <Listbox value={value} onChange={onChange}>
      <ListboxButton className="texno-sort-button" aria-label={`Сортировка: ${selected.label}`}>
        <span>{selected.label}</span><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </ListboxButton>
      <ListboxOptions anchor="bottom end" transition modal={false} className="texno-sort-options" aria-label="Сортировка">
        {options.map((option) => <ListboxOption key={option.value} value={option.value} className="texno-sort-option">
          {({ selected }) => <><span>{option.label}</span><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={selected ? undefined : "texno-sort-check-hidden"}><path d="m3 8 3 3 7-7" /></svg></>}
        </ListboxOption>)}
      </ListboxOptions>
    </Listbox>
  </div>
}
