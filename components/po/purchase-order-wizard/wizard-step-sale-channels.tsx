"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SaleChannel } from "@/lib/types/api";

type Props = {
  saleChannels: SaleChannel[];
  value: string;
  onChange: (saleChannelId: string) => void;
};

export function WizardStepSaleChannels({ saleChannels, value, onChange }: Props) {
  const saleChannelItems = useMemo(
    () =>
      saleChannels.map((sc) => ({
        value: sc.id,
        label: `${sc.name} (${sc.type})`,
      })),
    [saleChannels],
  );

  if (saleChannels.length === 0) {
    return <p className="text-sm text-muted-foreground">No sale channels available.</p>;
  }

  return (
    <div className="space-y-2">
      <Label>Sale channel</Label>
      <Select
        value={value}
        items={saleChannelItems}
        onValueChange={(v) => v && onChange(v)}
      >
        <SelectTrigger className="w-full max-w-md">
          <SelectValue placeholder="Choose a sale channel" />
        </SelectTrigger>
        <SelectContent>
          {saleChannels.map((sc) => (
            <SelectItem key={sc.id} value={sc.id}>
              {`${sc.name} (${sc.type})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Each order is tied to exactly one sale channel.
      </p>
    </div>
  );
}
