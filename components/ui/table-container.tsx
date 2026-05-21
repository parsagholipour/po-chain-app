import * as React from "react"

import { cn } from "@/lib/utils"

function TableContainer({
  className,
  footer,
  children,
  ...props
}: React.ComponentProps<"div"> & { footer?: React.ReactNode }) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card",
        className
      )}
      {...props}
    >
      {children}
      {footer ? (
        <div className="min-w-0 overflow-x-auto border-t border-border/80 bg-muted/20 px-2 py-2 sm:px-3">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export { TableContainer }
