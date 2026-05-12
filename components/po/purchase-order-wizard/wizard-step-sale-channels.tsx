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
import type { SaleChannel, SaleChannelLocation } from "@/lib/types/api";

const NO_LOCATION_ID = "none";

type Props = {
  saleChannels: SaleChannel[];
  value: string;
  onChange: (saleChannelId: string) => void;
  locations?: SaleChannelLocation[];
  locationValue?: string | null;
  onLocationChange?: (locationId: string | null) => void;
  locationsPending?: boolean;
  isPending?: boolean;
};

export function WizardStepSaleChannels({
  saleChannels,
  value,
  onChange,
  locations = [],
  locationValue = null,
  onLocationChange,
  locationsPending = false,
  isPending = false,
}: Props) {
  const saleChannelItems = useMemo(
    () =>
      saleChannels.map((sc) => ({
        value: sc.id,
        label: `${sc.name} (${sc.type})`,
      })),
    [saleChannels],
  );
  const locationItems = useMemo(
    () => [
      { value: NO_LOCATION_ID, label: "No location" },
      ...locations.map((location) => ({
        value: location.id,
        label: location.name,
      })),
    ],
    [locations],
  );

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (saleChannels.length === 0) {
    return <p className="text-sm text-muted-foreground">No sale channels available.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label required>Sale channel</Label>
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
      </div>

      {onLocationChange ? (
        <div className="space-y-2">
          <Label>Location</Label>
          <Select
            value={locationValue ?? NO_LOCATION_ID}
            items={locationItems}
            disabled={!value || locationsPending}
            onValueChange={(v) => {
              onLocationChange(v === NO_LOCATION_ID ? null : v);
            }}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder={locationsPending ? "Loading..." : "Choose a location"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LOCATION_ID}>No location</SelectItem>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Each order is tied to exactly one sale channel.
      </p>
    </div>
  );
}
