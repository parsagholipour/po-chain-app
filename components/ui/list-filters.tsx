"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { LIST_FILTER_ALL_VALUE } from "@/hooks/use-list-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ListFilterSelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type ListFilterSelect = {
  key: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ListFilterSelectOption[];
  ariaLabel: string;
  allLabel?: React.ReactNode;
  allValue?: string;
  disabled?: boolean;
  placeholder?: React.ReactNode;
  triggerClassName?: string;
};

type ListFiltersProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  selects?: readonly ListFilterSelect[];
  className?: string;
  disabled?: boolean;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  resultCount?: number;
  searchAriaLabel?: string;
  searchPlaceholder?: string;
  totalCount?: number;
};

export function ListFilters({
  searchValue,
  onSearchChange,
  selects = [],
  className,
  disabled = false,
  hasActiveFilters = false,
  onClear,
  resultCount,
  searchAriaLabel = "Search",
  searchPlaceholder = "Search...",
  totalCount,
}: ListFiltersProps) {
  const showCount = typeof resultCount === "number" && typeof totalCount === "number";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap gap-3">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={searchAriaLabel}
            className="pl-8"
            disabled={disabled}
            placeholder={searchPlaceholder}
            type="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        {selects.map((select) => {
          const allValue = select.allValue ?? LIST_FILTER_ALL_VALUE;

          return (
            <Select
              key={select.key}
              value={select.value}
              onValueChange={(value) => {
                if (value) select.onValueChange(value);
              }}
              disabled={disabled || select.disabled}
            >
              <SelectTrigger
                aria-label={select.ariaLabel}
                className={cn("w-full min-w-44 sm:w-[200px]", select.triggerClassName)}
              >
                <SelectValue placeholder={select.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {select.allLabel ? (
                  <SelectItem value={allValue}>{select.allLabel}</SelectItem>
                ) : null}
                {select.options.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
        {showCount ? (
          <div className="text-sm text-muted-foreground">
            {resultCount === totalCount ? `${totalCount} total` : `${resultCount} of ${totalCount}`}
          </div>
        ) : null}
        {onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Clear filters"
            disabled={disabled || !hasActiveFilters}
            onClick={onClear}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
