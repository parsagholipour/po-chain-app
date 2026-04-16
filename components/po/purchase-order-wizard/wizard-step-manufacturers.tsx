"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { Manufacturer } from "@/lib/types/api";

type Props = {
  manufacturers: Manufacturer[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
  isPending?: boolean;
};

export function WizardStepManufacturers({
  manufacturers,
  selectedIds,
  onToggle,
  isPending = false,
}: Props) {
  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (manufacturers.length === 0) {
    return <p className="text-sm text-muted-foreground">No manufacturers yet.</p>;
  }

  return (
    <div className="space-y-3">
      {manufacturers.map((m) => (
        <div
          key={m.id}
          className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/40"
        >
          <Checkbox
            checked={selectedIds.has(m.id)}
            onCheckedChange={(v) => onToggle(m.id, v === true)}
            label={
              <div className="flex items-center gap-3">
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted-foreground">{m.region}</span>
              </div>
            }
          />
        </div>
      ))}
    </div>
  );
}
