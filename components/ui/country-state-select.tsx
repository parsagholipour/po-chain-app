"use client"

import * as React from "react"
import { allCountries, US } from "country-region-data"

import {
  SearchableSelect,
  type SearchableSelectItem,
  type SearchableSelectSingleProps,
} from "@/components/ui/searchable-select"

export const UNITED_STATES_COUNTRY = "United States"

const popularCountryNames = [
  "United States",
  "Canada",
  "United Kingdom",
  "United Arab Emirates",
  "Australia",
  "China",
  "India",
  "Germany",
  "France",
  "Japan",
] as const

function countryToSelectItem([countryName, countryShortCode]: (typeof allCountries)[number]) {
  return {
    value: countryName,
    label: countryName,
    keywords: countryShortCode,
  }
}

const popularCountryNameSet = new Set<string>(popularCountryNames)
const popularCountryItems = popularCountryNames.flatMap((countryName) => {
  const country = allCountries.find(([name]) => name === countryName)
  return country ? [countryToSelectItem(country)] : []
})

export const countrySelectItems: readonly SearchableSelectItem[] = [
  ...popularCountryItems,
  ...allCountries
    .filter(([countryName]) => !popularCountryNameSet.has(countryName))
    .map(countryToSelectItem),
]

export const usStateSelectItems: readonly SearchableSelectItem[] = US[2].map(
  ([stateName, stateShortCode]) => ({
    value: stateName,
    label: stateName,
    keywords: stateShortCode,
  }),
)

type CountryStateSelectProps = Omit<SearchableSelectSingleProps, "items">

function withCurrentOption(
  items: readonly SearchableSelectItem[],
  value: string | null | undefined,
) {
  const trimmed = value?.trim()
  if (!trimmed || items.some((item) => item.value === trimmed)) return items
  return [{ value: trimmed, label: trimmed }, ...items]
}

export function isUnitedStatesCountry(value: string | null | undefined) {
  return value === UNITED_STATES_COUNTRY
}

export function CountrySelect({
  value,
  placeholder = "Select country",
  emptyMessage = "No countries found.",
  ...props
}: CountryStateSelectProps) {
  const items = React.useMemo(() => withCurrentOption(countrySelectItems, value), [value])

  return (
    <SearchableSelect
      {...props}
      items={items}
      value={value}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
    />
  )
}

export function UsStateSelect({
  value,
  placeholder = "Select state",
  emptyMessage = "No states found.",
  ...props
}: CountryStateSelectProps) {
  const items = React.useMemo(() => withCurrentOption(usStateSelectItems, value), [value])

  return (
    <SearchableSelect
      {...props}
      items={items}
      value={value}
      placeholder={placeholder}
      emptyMessage={emptyMessage}
    />
  )
}
