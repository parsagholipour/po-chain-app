import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PriceFieldProps = React.ComponentProps<typeof Input>;

/**
 * Decimal money input for forms (non-negative by default).
 */
export const PriceField = React.forwardRef<HTMLInputElement, PriceFieldProps>(
  function PriceField({ className, min = 0, step = "0.01", type = "number", ...props }, ref) {
    return (
      <Input
        ref={ref}
        type={type}
        min={min}
        step={step}
        className={cn("tabular-nums", className)}
        {...props}
      />
    );
  },
);

PriceField.displayName = "PriceField";
