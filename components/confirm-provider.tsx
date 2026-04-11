"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmVariant = "default" | "destructive";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue["confirm"] {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const pendingRef = React.useRef<((value: boolean) => void) | null>(null);
  const openRef = React.useRef(open);

  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    if (pendingRef.current !== null) {
      return Promise.resolve(false);
    }
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      pendingRef.current = resolve;
    });
  }, []);

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      const resolve = pendingRef.current;
      pendingRef.current = null;
      resolve?.(false);
    }
  }, []);

  const handleOpenChangeComplete = React.useCallback((isOpen: boolean) => {
    if (!isOpen && !openRef.current) {
      setOptions(null);
    }
  }, []);

  const handleConfirm = React.useCallback(() => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    resolve?.(true);
    setOpen(false);
  }, []);

  const cancelLabel = options?.cancelLabel ?? "Cancel";

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        onOpenChangeComplete={handleOpenChangeComplete}
      >
        <DialogContent showCloseButton={false} disableCloseAnimation>
          {options ? (
            <>
              <DialogHeader
                className={options.description ? undefined : "border-b-0 pb-1"}
              >
                <DialogTitle>{options.title}</DialogTitle>
                {options.description ? (
                  <DialogDescription>{options.description}</DialogDescription>
                ) : null}
              </DialogHeader>
              <DialogFooter className="mx-0 mb-0 rounded-none border-t-0 bg-transparent p-0 pt-3 pb-1">
                <DialogClose
                  type="button"
                  render={<Button variant="outline" className="active:translate-y-0" />}
                >
                  {cancelLabel}
                </DialogClose>
                <Button
                  type="button"
                  className="active:translate-y-0"
                  variant={
                    options.variant === "destructive"
                      ? "destructive"
                      : "default"
                  }
                  onClick={handleConfirm}
                >
                  {options.confirmLabel}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
