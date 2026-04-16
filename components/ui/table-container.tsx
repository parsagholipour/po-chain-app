import * as React from "react"

import { cn } from "@/lib/utils"

function TableContainer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "overflow-hidden rounded-xl border border-border/80 bg-card",
        className
      )}
      {...props}
    />
  )
}

export { TableContainer }
