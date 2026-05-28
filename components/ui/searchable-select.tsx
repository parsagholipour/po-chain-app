"use client"

import * as React from "react"
import { Combobox } from "@base-ui/react/combobox"
import { useVirtualizer } from "@tanstack/react-virtual"
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type SearchableSelectItem = {
  value: string
  label: string
  /** Shorter text used for selected chips in multi-select mode. */
  selectedLabel?: string
  /** Extra text included in search (for example SKU). */
  keywords?: string
}

const VIRTUALIZE_THRESHOLD = 50
const ESTIMATED_ITEM_HEIGHT = 32

const inputGroupClassName =
  "flex w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors outline-none select-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground h-8 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const popupClassName =
  "relative isolate z-50 min-h-0 max-h-[min(var(--available-height),18rem)] w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"

const listClassName = "min-h-0 scroll-my-1 p-1"

const virtualListClassName =
  "min-h-0 max-h-[min(var(--available-height),18rem)] scroll-my-1 overflow-y-auto p-1"

const itemClassName =
  "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2"

const inputClassName =
  "h-8 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm shadow-none outline-none ring-0 placeholder:text-muted-foreground focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"

const chipClassName =
  "inline-flex h-6 max-w-[11rem] min-w-0 items-center gap-1 rounded-md border border-border bg-muted px-1.5 text-xs leading-none text-foreground"

const chipRemoveClassName =
  "inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"

const chipsClassName =
  "flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"

function defaultFilter(item: SearchableSelectItem, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item.label.toLowerCase().includes(q)) return true
  if (item.value.toLowerCase().includes(q)) return true
  if (item.keywords?.toLowerCase().includes(q)) return true
  return false
}

function SearchableSelectItemRow({ item }: { item: SearchableSelectItem }) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <CheckIcon className="pointer-events-none size-4" />
      </Combobox.ItemIndicator>
    </>
  )
}

type VirtualListHandle = {
  filteredItems: SearchableSelectItem[]
  scrollToIndex: (index: number, align: "start" | "end") => void
}

function SearchableSelectVirtualList({
  open,
  listRef,
  isItemDisabled,
}: {
  open: boolean
  listRef: React.RefObject<VirtualListHandle | null>
  isItemDisabled?: (item: SearchableSelectItem) => boolean
}) {
  const filteredItems = Combobox.useFilteredItems<SearchableSelectItem>()
  const scrollElementRef = React.useRef<HTMLDivElement | null>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    enabled: open,
    count: filteredItems.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 12,
    getItemKey: (index) => filteredItems[index]?.value ?? index,
  })

  const scrollToIndex = React.useCallback(
    (index: number, align: "start" | "end") => {
      virtualizer.scrollToIndex(index, { align })
    },
    [virtualizer],
  )

  React.useEffect(() => {
    listRef.current = { filteredItems, scrollToIndex }
    return () => {
      listRef.current = null
    }
  }, [filteredItems, listRef, scrollToIndex])

  const handleListRef = React.useCallback(
    (element: HTMLDivElement | null) => {
      scrollElementRef.current = element
      if (element) {
        virtualizer.measure()
      }
    },
    [virtualizer],
  )

  React.useEffect(() => {
    virtualizer.scrollToOffset(0)
  }, [virtualizer, filteredItems.length])

  return (
    <Combobox.List ref={handleListRef} className={virtualListClassName}>
      {filteredItems.length > 0 && (
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = filteredItems[virtualRow.index]
            if (!item) return null

            return (
              <div
                key={virtualRow.key}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <Combobox.Item
                  value={item}
                  index={virtualRow.index}
                  disabled={isItemDisabled?.(item)}
                  className={itemClassName}
                >
                  <SearchableSelectItemRow item={item} />
                </Combobox.Item>
              </div>
            )
          })}
        </div>
      )}
    </Combobox.List>
  )
}

type SearchableSelectBaseProps = {
  items: readonly SearchableSelectItem[]
  placeholder?: string
  disabled?: boolean
  "aria-invalid"?: boolean
  className?: string
  emptyMessage?: string
  filter?: (item: SearchableSelectItem, query: string) => boolean
  id?: string
  name?: string
}

export type SearchableSelectSingleProps = SearchableSelectBaseProps & {
  multiple?: false
  value: string
  onValueChange: (value: string) => void
}

export type SearchableSelectMultipleProps = SearchableSelectBaseProps & {
  multiple: true
  value: readonly string[]
  onValueChange: (value: string[]) => void
  fixedValues?: readonly string[]
}

export type SearchableSelectProps =
  | SearchableSelectSingleProps
  | SearchableSelectMultipleProps

function uniqueValues(values: readonly string[]) {
  return [...new Set(values)]
}

function selectedItemsFromValues(
  items: readonly SearchableSelectItem[],
  values: readonly string[],
) {
  const itemByValue = new Map(items.map((item) => [item.value, item]))

  return values.map((value) => itemByValue.get(value) ?? { value, label: value })
}

function focusInputSoon(input: HTMLInputElement | null) {
  queueMicrotask(() => {
    input?.focus()
  })
  requestAnimationFrame(() => {
    input?.focus()
  })
}

function shouldIgnoreGroupFocus(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("input, textarea, button, [contenteditable='true']"))
  )
}

function SearchableSelectSingle({
  items,
  value,
  onValueChange,
  placeholder = "Select…",
  disabled = false,
  "aria-invalid": ariaInvalid,
  className,
  emptyMessage = "No results.",
  filter = defaultFilter,
  id,
  name,
}: SearchableSelectSingleProps) {
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const virtualListRef = React.useRef<VirtualListHandle | null>(null)
  const shouldVirtualize = items.length >= VIRTUALIZE_THRESHOLD

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) focusInputSoon(inputRef.current)
  }, [])

  const handleInputGroupFocus = React.useCallback(
    (event: React.SyntheticEvent<HTMLDivElement>) => {
      if (disabled || shouldIgnoreGroupFocus(event.target)) return
      focusInputSoon(inputRef.current)
    },
    [disabled],
  )

  const selected = React.useMemo(
    () => items.find((i) => i.value === value) ?? null,
    [items, value],
  )

  const handleItemHighlighted = React.useCallback(
    (
      highlighted: SearchableSelectItem | undefined,
      details: Combobox.Root.HighlightEventDetails,
    ) => {
      if (!shouldVirtualize || !highlighted || !virtualListRef.current) return

      const { filteredItems, scrollToIndex } = virtualListRef.current
      const index = filteredItems.findIndex((item) => item.value === highlighted.value)
      if (index === -1) return

      const isStart = index === 0
      const isEnd = index === filteredItems.length - 1
      const shouldScroll =
        details.reason === "none" ||
        (details.reason === "keyboard" && (isStart || isEnd))

      if (shouldScroll) {
        queueMicrotask(() => {
          scrollToIndex(index, isEnd ? "start" : "end")
        })
      }
    },
    [shouldVirtualize],
  )

  return (
    <Combobox.Root
      items={items}
      value={selected}
      onValueChange={(next: SearchableSelectItem | null) => {
        onValueChange(next?.value ?? "")
      }}
      disabled={disabled}
      filter={filter}
      virtualized={shouldVirtualize}
      isItemEqualToValue={(a: SearchableSelectItem, b: SearchableSelectItem) =>
        a.value === b.value
      }
      id={id}
      name={name}
      onOpenChange={handleOpenChange}
      onItemHighlighted={shouldVirtualize ? handleItemHighlighted : undefined}
    >
      <Combobox.InputGroup
        data-slot="searchable-select-trigger"
        aria-invalid={ariaInvalid}
        onPointerDownCapture={handleInputGroupFocus}
        onClick={handleInputGroupFocus}
        className={cn(inputGroupClassName, className)}
      >
        <Combobox.Input
          ref={inputRef}
          id={id}
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
          <Combobox.Popup
            data-slot="searchable-select-content"
            className={cn(
              popupClassName,
              shouldVirtualize ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {shouldVirtualize ? (
              <SearchableSelectVirtualList open={open} listRef={virtualListRef} />
            ) : (
              <Combobox.List className={listClassName}>
                {(item: SearchableSelectItem) => (
                  <Combobox.Item key={item.value} value={item} className={itemClassName}>
                    <SearchableSelectItemRow item={item} />
                  </Combobox.Item>
                )}
              </Combobox.List>
            )}
            <Combobox.Empty className="empty:hidden px-2 py-2 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </Combobox.Empty>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

function SearchableSelectMultiple({
  items,
  value,
  fixedValues = [],
  onValueChange,
  placeholder = "Select…",
  disabled = false,
  "aria-invalid": ariaInvalid,
  className,
  emptyMessage = "No results.",
  filter = defaultFilter,
  id,
  name,
}: SearchableSelectMultipleProps) {
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const virtualListRef = React.useRef<VirtualListHandle | null>(null)
  const shouldVirtualize = items.length >= VIRTUALIZE_THRESHOLD

  const selectedValueIds = React.useMemo(
    () => uniqueValues([...fixedValues, ...value]),
    [fixedValues, value],
  )
  const selectedItems = React.useMemo(
    () => selectedItemsFromValues(items, selectedValueIds),
    [items, selectedValueIds],
  )
  const fixedValueSet = React.useMemo(() => new Set(fixedValues), [fixedValues])

  const emitValueChange = React.useCallback(
    (nextItems: SearchableSelectItem[]) => {
      const nextIds = nextItems.map((item) => item.value)
      onValueChange(uniqueValues([...fixedValues, ...nextIds]))
    },
    [fixedValues, onValueChange],
  )

  const isItemDisabled = React.useCallback(
    (item: SearchableSelectItem) => fixedValueSet.has(item.value),
    [fixedValueSet],
  )

  const handleItemHighlighted = React.useCallback(
    (
      highlighted: SearchableSelectItem | undefined,
      details: Combobox.Root.HighlightEventDetails,
    ) => {
      if (!shouldVirtualize || !highlighted || !virtualListRef.current) return

      const { filteredItems, scrollToIndex } = virtualListRef.current
      const index = filteredItems.findIndex((item) => item.value === highlighted.value)
      if (index === -1) return

      const isStart = index === 0
      const isEnd = index === filteredItems.length - 1
      const shouldScroll =
        details.reason === "none" ||
        (details.reason === "keyboard" && (isStart || isEnd))

      if (shouldScroll) {
        queueMicrotask(() => {
          scrollToIndex(index, isEnd ? "start" : "end")
        })
      }
    },
    [shouldVirtualize],
  )

  const handleOpenChange = React.useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) focusInputSoon(inputRef.current)
  }, [])

  const handleInputGroupFocus = React.useCallback(
    (event: React.SyntheticEvent<HTMLDivElement>) => {
      if (disabled || shouldIgnoreGroupFocus(event.target)) return
      focusInputSoon(inputRef.current)
    },
    [disabled],
  )

  return (
    <Combobox.Root
      multiple
      items={items}
      value={selectedItems}
      onValueChange={emitValueChange}
      disabled={disabled}
      filter={filter}
      virtualized={shouldVirtualize}
      isItemEqualToValue={(a: SearchableSelectItem, b: SearchableSelectItem) =>
        a.value === b.value
      }
      id={id}
      name={name}
      onOpenChange={handleOpenChange}
      onItemHighlighted={shouldVirtualize ? handleItemHighlighted : undefined}
    >
      <Combobox.InputGroup
        data-slot="searchable-select-trigger"
        aria-invalid={ariaInvalid}
        onPointerDownCapture={handleInputGroupFocus}
        onClick={handleInputGroupFocus}
        className={cn(
          inputGroupClassName,
          "h-9 items-center py-1.5",
          className,
        )}
      >
        <Combobox.Chips className={chipsClassName}>
          {selectedItems.map((item) => {
            const fixed = fixedValueSet.has(item.value)
            const selectedLabel = item.selectedLabel ?? item.label

            return (
              <Combobox.Chip key={item.value} className={chipClassName} title={item.label}>
                <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
                <Combobox.ChipRemove
                  type="button"
                  disabled={fixed}
                  aria-label={`Remove ${item.label}`}
                  className={chipRemoveClassName}
                >
                  <XIcon className="size-3" />
                </Combobox.ChipRemove>
              </Combobox.Chip>
            )
          })}
          <Combobox.Input
            ref={inputRef}
            id={id}
            placeholder={selectedItems.length > 0 ? "" : placeholder}
            className={cn(
              inputClassName,
              selectedItems.length > 0
                ? "h-6 min-w-6 flex-[0_0_1.5rem]"
                : "h-6 min-w-[8rem] flex-1",
            )}
          />
        </Combobox.Chips>
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
          <Combobox.Popup
            data-slot="searchable-select-content"
            className={cn(
              popupClassName,
              shouldVirtualize ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            {shouldVirtualize ? (
              <SearchableSelectVirtualList
                open={open}
                listRef={virtualListRef}
                isItemDisabled={isItemDisabled}
              />
            ) : (
              <Combobox.List className={listClassName}>
                {(item: SearchableSelectItem) => (
                  <Combobox.Item
                    key={item.value}
                    value={item}
                    disabled={isItemDisabled(item)}
                    className={itemClassName}
                  >
                    <SearchableSelectItemRow item={item} />
                  </Combobox.Item>
                )}
              </Combobox.List>
            )}
            <Combobox.Empty className="empty:hidden px-2 py-2 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </Combobox.Empty>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

export function SearchableSelect(props: SearchableSelectProps) {
  if (props.multiple) {
    return <SearchableSelectMultiple {...props} />
  }

  return <SearchableSelectSingle {...props} />
}
