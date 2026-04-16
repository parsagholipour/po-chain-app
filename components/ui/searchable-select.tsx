"use client"

import * as React from "react"
import { Combobox } from "@base-ui/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type SearchableSelectItem = {
  value: string
  label: string
  /** Extra text included in search (for example SKU). */
  keywords?: string
}

const inputGroupClassName =
  "flex w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground h-8 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const popupClassName =
  "relative isolate z-50 min-h-0 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"

const listClassName = "min-h-0 scroll-my-1 p-1"

const itemClassName =
  "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2"

const inputClassName =
  "h-8 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"

function defaultFilter(item: SearchableSelectItem, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item.label.toLowerCase().includes(q)) return true
  if (item.value.toLowerCase().includes(q)) return true
  if (item.keywords?.toLowerCase().includes(q)) return true
  return false
}

export type SearchableSelectProps = {
  items: readonly SearchableSelectItem[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  emptyMessage?: string
  filter?: (item: SearchableSelectItem, query: string) => boolean
  id?: string
  name?: string
}

export function SearchableSelect({
  items,
  value,
  onValueChange,
  placeholder = "Select…",
  disabled = false,
  className,
  emptyMessage = "No results.",
  filter = defaultFilter,
  id,
  name,
}: SearchableSelectProps) {
  const selected = React.useMemo(
    () => items.find((i) => i.value === value) ?? null,
    [items, value],
  )

  return (
    <Combobox.Root
      items={[...items]}
      value={selected}
      onValueChange={(next: SearchableSelectItem | null) => {
        onValueChange(next?.value ?? "")
      }}
      disabled={disabled}
      filter={filter}
      isItemEqualToValue={(a: SearchableSelectItem, b: SearchableSelectItem) =>
        a.value === b.value
      }
      id={id}
      name={name}
    >
      <Combobox.InputGroup
        data-slot="searchable-select-trigger"
        className={cn(inputGroupClassName, className)}
      >
        <Combobox.Input
          placeholder={placeholder}
          className={inputClassName}
        />
        <Combobox.Icon className="pointer-events-none shrink-0 text-muted-foreground">
          <ChevronDownIcon className="size-4" />
        </Combobox.Icon>
      </Combobox.InputGroup>
      <Combobox.Portal>
        <Combobox.Positioner
          className="isolate z-50 outline-none"
          side="bottom"
          sideOffset={4}
          align="center"
        >
          <Combobox.Popup data-slot="searchable-select-content" className={popupClassName}>
            <Combobox.List className={listClassName}>
              {(item: SearchableSelectItem) => (
                <Combobox.Item key={item.value} value={item} className={itemClassName}>
                  <span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">{item.label}</span>
                  <Combobox.ItemIndicator
                    className="pointer-events-none absolute right-2 flex size-4 items-center justify-center"
                  >
                    <CheckIcon className="pointer-events-none size-4" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            <Combobox.Empty className="empty:hidden px-2 py-2 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </Combobox.Empty>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
