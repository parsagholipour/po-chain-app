import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PriceFieldProps = React.ComponentProps<typeof Input>;

/**
 * Decimal USD input for forms (non-negative by default).
 */
export const PriceField = React.forwardRef<HTMLInputElement, PriceFieldProps>(
  function PriceField(
    { className, inputMode = "decimal", min = 0, step = "0.01", type = "number", ...props },
    ref,
  ) {
    return (
      <div className="relative w-full min-w-0">
        <Input
          ref={ref}
          type={type}
          inputMode={inputMode}
          min={min}
          step={step}
          className={cn("peer pl-7 tabular-nums", className)}
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-sm text-muted-foreground peer-disabled:opacity-50 peer-aria-invalid:text-destructive"
        >
          $
        </span>
      </div>
    );
  },
);

PriceField.displayName = "PriceField";
