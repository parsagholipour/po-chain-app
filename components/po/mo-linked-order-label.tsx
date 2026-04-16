import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** One line: SO|PO badge, order name, optional sale channel last. */
export function MoLinkedOrderLabel({
  type,
  name,
  saleChannelName,
  className,
  badgeClassName,
}: {
  type: "distributor" | "stock";
  name: string;
  saleChannelName?: string | null;
  className?: string;
  badgeClassName?: string;
}) {
  const kind = type === "stock" ? "SO" : "PO";
  const ch = saleChannelName?.trim() || null;
  return (
    <span
      className={cn(
        "flex min-w-0 max-w-full flex-nowrap items-center gap-1 leading-tight",
        className,
      )}
    >
      <Badge
        variant="secondary"
        className={cn("h-4 shrink-0 px-1 text-[9px] font-semibold", badgeClassName)}
      >
        {kind}
      </Badge>
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {ch ? (
        <>
          <span className="shrink-0 text-muted-foreground" aria-hidden>
            ·
          </span>
          <span className="max-w-[45%] shrink-0 truncate text-muted-foreground">{ch}</span>
        </>
      ) : null}
    </span>
  );
}
