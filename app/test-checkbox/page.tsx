"use client";
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";

export default function TestPage() {
  const [c1, setC1] = React.useState(false);
  const [c2, setC2] = React.useState(false);

  return (
    <div className="p-8 space-y-4">
      <label className="flex gap-2">
        <Checkbox checked={c1} onCheckedChange={setC1} />
        Label 1 (Nested, no ID)
      </label>

      <div className="flex gap-2">
        <Checkbox id="c2" checked={c2} onCheckedChange={setC2} />
        <label htmlFor="c2">Label 2 (htmlFor)</label>
      </div>
    </div>
  );
}
