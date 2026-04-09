"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { Manufacturer } from "@/lib/types/api";

type Props = {
  manufacturers: Manufacturer[];
  selectedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
};

export function WizardStepManufacturers({
  manufacturers,
  selectedIds,
  onToggle,
}: Props) {
  if (manufacturers.length === 0) {
    return <p className="text-sm text-muted-foreground">No manufacturers yet.</p>;
  }

  return (
    <div className="space-y-3">
      {manufacturers.map((m) => (
        <label
          key={m.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/40"
        >
          <Checkbox
            checked={selectedIds.has(m.id)}
            onCheckedChange={(v) => onToggle(m.id, v === true)}
          />
          <span className="font-medium">{m.name}</span>
          <span className="text-xs text-muted-foreground">{m.region}</span>
        </label>
      ))}
    </div>
  );
}
