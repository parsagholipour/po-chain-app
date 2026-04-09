"use client";

import { ImageOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { cn } from "@/lib/utils";

type LineItemsGridProps = {
  children: React.ReactNode;
  className?: string;
  /** More columns, tighter gaps — e.g. order list expand previews. */
  dense?: boolean;
};

/** Responsive grid wrapper for line-item cards (PO lines, packing lists, etc.). */
export function LineItemsGrid({ children, className, dense }: LineItemsGridProps) {
  return (
    <div
      className={cn(
        dense
          ? "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
          : "grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type LineItemCardProps = {
  /** Storage object key; gray placeholder when missing or URL fails. */
  imageKey?: string | null;
  title: string;
  subtitle: string;
  footer?: React.ReactNode;
  className?: string;
  /** Edit control over the image; visible on hover (always on coarse pointers / small screens). */
  onEditProduct?: () => void;
  /** Smaller image and typography for dense grids. */
  compact?: boolean;
};

/**
 * Single line-item tile: image (or placeholder), centered title and subtitle.
 * Optional footer slot for actions (e.g. qty / manufacturer on PO lines).
 */
const lineItemImageFallback = (
  <div
    className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted text-muted-foreground"
    aria-hidden
  >
    <ImageOff className="size-10 opacity-40" strokeWidth={1.25} />
  </div>
);

const lineItemImageFallbackCompact = (
  <div
    className="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-muted-foreground"
    aria-hidden
  >
    <ImageOff className="size-5 opacity-40" strokeWidth={1.25} />
  </div>
);

export function LineItemCard({
  imageKey,
  title,
  subtitle,
  footer,
  className,
  onEditProduct,
  compact = false,
}: LineItemCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col items-center border border-border/80 bg-card text-center shadow-sm",
        compact ? "gap-2 rounded-lg p-2" : "gap-3 rounded-xl p-4",
        className,
      )}
    >
      <div
        className={cn(
          "group/image relative w-full",
          compact ? "max-w-[4.5rem]" : "max-w-[200px]",
        )}
      >
        <StorageObjectImage
          reference={imageKey ?? null}
          alt=""
          className={cn("w-full ring-0 bg-muted/40", compact ? "rounded-md" : "rounded-lg")}
          imgClassName={compact ? "rounded-md" : "rounded-lg"}
          objectFit="contain"
          aspectFallback="1 / 1"
          fallback={compact ? lineItemImageFallbackCompact : lineItemImageFallback}
        />
        {onEditProduct ? (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 flex items-start justify-end transition-opacity",
              compact ? "p-1" : "p-1.5",
              "opacity-100 sm:opacity-0 sm:group-hover/image:opacity-100 sm:group-focus-within/image:opacity-100",
            )}
          >
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="pointer-events-auto z-10 shadow-md"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEditProduct();
              }}
              aria-label="Edit product"
            >
              <Pencil className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex w-full min-w-0 flex-col gap-0.5">
        <h3
          className={cn(
            "font-medium leading-snug text-foreground",
            compact ? "line-clamp-2 text-xs" : "text-sm",
          )}
        >
          {title}
        </h3>
        <p
          className={cn(
            compact
              ? "line-clamp-2 text-[11px] leading-snug text-muted-foreground"
              : "text-sm text-foreground",
          )}
        >
          {subtitle}
        </p>
      </div>
      {footer ? (
        <div
          className={cn(
            "w-full border-t border-border/60",
            compact ? "pt-1.5" : "pt-3",
          )}
        >
          {footer}
        </div>
      ) : null}
    </article>
  );
}
