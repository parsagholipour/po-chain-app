"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  title: string;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string) => void;
};

export function WarningDisregardDialog({
  open,
  title,
  pending = false,
  onOpenChange,
  onSubmit,
}: Props) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disregard warning</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed || pending) return;
            onSubmit(trimmed);
          }}
        >
          <FieldSet>
            <FieldGroup>
              <p className="text-sm text-muted-foreground">{title}</p>
              <Field>
                <FieldLabel htmlFor="warning-disregard-reason" required>
                  Reason
                </FieldLabel>
                <Textarea
                  id="warning-disregard-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Describe why this warning can be ignored."
                  rows={4}
                  required
                />
              </Field>
            </FieldGroup>
          </FieldSet>
          <DialogFooter className="mt-4 border-0 bg-transparent">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || trimmed.length === 0}>
              Disregard
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
