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
        "overflow-hidden rounded-xl border border-border/80 bg-card",
        className
      )}
      {...props}
    >
      {children}
      {footer ? (
        <div className="border-t border-border/80 bg-muted/20 px-3 py-2">
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export { TableContainer }
