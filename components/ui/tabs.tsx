"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

type TabsListVariant = "default" | "line" | "underline"

/** One static class string for SSR/client parity; width/layout follows `data-variant`. */
const tabsListClassName =
  "group/tabs-list inline-flex max-w-full items-center justify-start overflow-x-auto overscroll-x-contain rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col [-webkit-overflow-scrolling:touch] data-[variant=default]:w-fit data-[variant=default]:bg-muted data-[variant=line]:w-fit data-[variant=line]:gap-1 data-[variant=line]:rounded-none data-[variant=line]:bg-transparent data-[variant=underline]:h-auto data-[variant=underline]:min-h-12 data-[variant=underline]:w-full data-[variant=underline]:gap-4 data-[variant=underline]:rounded-none data-[variant=underline]:border-0 data-[variant=underline]:border-b data-[variant=underline]:border-border data-[variant=underline]:bg-muted/30 data-[variant=underline]:px-3 data-[variant=underline]:sm:gap-8 data-[variant=underline]:sm:px-4"

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & { variant?: TabsListVariant }) {
  return (
    <TabsPrimitive.List
      {...props}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListClassName, className)}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] items-center justify-center gap-1.5 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=default]/tabs-list:h-[calc(100%-1px)] group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:shrink-0 group-data-[variant=default]/tabs-list:px-1.5 group-data-[variant=default]/tabs-list:py-0.5 group-data-[variant=default]/tabs-list:text-foreground/60 group-data-[variant=default]/tabs-list:hover:text-foreground dark:group-data-[variant=default]/tabs-list:text-muted-foreground dark:group-data-[variant=default]/tabs-list:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:bg-background group-data-[variant=default]/tabs-list:data-active:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm dark:group-data-[variant=default]/tabs-list:data-active:border-input dark:group-data-[variant=default]/tabs-list:data-active:bg-input/30 dark:group-data-[variant=default]/tabs-list:data-active:text-foreground",
        "group-data-[variant=line]/tabs-list:h-[calc(100%-1px)] group-data-[variant=line]/tabs-list:flex-1 group-data-[variant=line]/tabs-list:shrink-0 group-data-[variant=line]/tabs-list:px-1.5 group-data-[variant=line]/tabs-list:py-0.5 group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:text-foreground/60 group-data-[variant=line]/tabs-list:hover:text-foreground dark:group-data-[variant=line]/tabs-list:text-muted-foreground dark:group-data-[variant=line]/tabs-list:hover:text-foreground group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-[variant=line]/tabs-list:data-active:shadow-none dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:text-foreground after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        "group-data-[variant=underline]/tabs-list:shrink-0 group-data-[variant=underline]/tabs-list:rounded-none group-data-[variant=underline]/tabs-list:border-0 group-data-[variant=underline]/tabs-list:border-b-2 group-data-[variant=underline]/tabs-list:border-transparent group-data-[variant=underline]/tabs-list:bg-transparent group-data-[variant=underline]/tabs-list:px-3 group-data-[variant=underline]/tabs-list:py-3 group-data-[variant=underline]/tabs-list:text-muted-foreground group-data-[variant=underline]/tabs-list:shadow-none group-data-[variant=underline]/tabs-list:after:hidden group-data-[variant=underline]/tabs-list:hover:border-border group-data-[variant=underline]/tabs-list:hover:text-foreground group-data-[variant=underline]/tabs-list:data-active:-mb-px group-data-[variant=underline]/tabs-list:data-active:border-primary group-data-[variant=underline]/tabs-list:data-active:bg-transparent group-data-[variant=underline]/tabs-list:data-active:text-foreground group-data-[variant=underline]/tabs-list:data-active:shadow-none dark:group-data-[variant=underline]/tabs-list:data-active:border-primary dark:group-data-[variant=underline]/tabs-list:data-active:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListClassName }
export type { TabsListVariant }
