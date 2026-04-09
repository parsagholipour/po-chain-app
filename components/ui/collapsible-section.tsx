"use client";

import { useCallback, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CollapsibleSectionProps = {
  /** Prefix for stable `aria-controls` / region ids (combined with React `useId`). */
  sectionId: string;
  title: string;
  /** Shown next to the title when collapsed (e.g. counts). */
  summary?: string;
  /** Extra context; only visible while expanded. */
  description?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state; pass with `onOpenChange` to control from outside. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Actions always visible (e.g. Add) — kept outside the toggle control. */
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function CollapsibleSection({
  sectionId,
  title,
  summary,
  description,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  headerActions,
  children,
  className,
}: CollapsibleSectionProps) {
  const baseId = useId();
  const panelId = `${sectionId}-${baseId}`;
  const triggerId = `${panelId}-trigger`;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm ring-1 ring-border/40",
        className,
      )}
    >
      <div className="flex flex-col">
        <div className="flex flex-wrap items-start gap-3 border-b border-border/60 bg-muted/10 px-3 py-3 sm:px-4 sm:py-3.5">
          <button
            type="button"
            id={triggerId}
            className={cn(
              "flex min-w-0 flex-1 items-start gap-2 rounded-lg p-1 text-start -m-1",
              "outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={toggle}
          >
            <ChevronDown
              className={cn(
                "mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
                open ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-base font-semibold tracking-tight text-foreground">{title}</span>
                {!open && summary ? (
                  <span className="text-xs font-normal text-muted-foreground">{summary}</span>
                ) : null}
              </span>
              {open && description ? (
                <div className="text-pretty text-xs leading-relaxed text-muted-foreground">{description}</div>
              ) : null}
            </span>
          </button>
          {headerActions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">{headerActions}</div>
          ) : null}
        </div>

        <div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          className={cn(
            "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="px-3 pb-4 pt-4 sm:px-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
