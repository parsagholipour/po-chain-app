"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2 } from "lucide-react";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (v: { productId: string; quantity: number }) => Promise<void>;
};

export function AddPoLineDialog({ open, onOpenChange, onSubmit }: Props) {
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await api.get<ProductOption[]>("/api/products");
      return data;
    },
    enabled: open,
  });

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const productSelectItems = products.map((p) => ({
    value: p.id,
    label: p.name,
    keywords: p.sku,
  }));

  function handleOpenChange(next: boolean) {
    if (!next) {
      setProductId("");
      setQuantity(1);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add line</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!productId) return;
            setSubmitting(true);
            try {
              await onSubmit({ productId, quantity });
              handleOpenChange(false);
            } catch {
              // Parent mutation toasts
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="space-y-2">
            <Label required>Product</Label>
            <SearchableSelect
              className="w-full"
              items={productSelectItems}
              value={productId}
              disabled={submitting}
              placeholder="Select product"
              onValueChange={setProductId}
            />
          </div>
          <div className="space-y-2">
            <Label required>Quantity</Label>
            <Input
              type="number"
              min={1}
              value={quantity}
              disabled={submitting}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <DialogFooter className="border-0 bg-transparent">
            <Button type="submit" disabled={submitting || !productId}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
