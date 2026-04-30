"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type LabelProps = React.ComponentProps<"label"> & {
  required?: boolean
}

function RequiredIndicator() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

function Label({ className, children, required, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {required ? (
        <span className="inline-flex items-baseline gap-0.5">
          {children}
          <RequiredIndicator />
        </span>
      ) : (
        children
      )}
    </label>
  )
}

export { Label, RequiredIndicator }
