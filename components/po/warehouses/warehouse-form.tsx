"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useFormState, type Resolver } from "react-hook-form";
import { z } from "zod";
import { warehouseCreateSchema } from "@/lib/validations/master-data";
import type { SaleChannel } from "@/lib/types/api";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export type WarehouseFormValues = z.infer<typeof warehouseCreateSchema>;

const NO_SALE_CHANNEL_ID = "none";

export function emptyWarehouseFormValues(): WarehouseFormValues {
  return {
    name: "",
    address: "",
    phoneNumber: "",
    email: "",
    saleChannelId: null,
  };
}

type Props = {
  defaultValues: WarehouseFormValues;
  saleChannels: SaleChannel[];
  saleChannelsPending?: boolean;
  onSubmit: (values: WarehouseFormValues) => Promise<string>;
  onCancel: () => void;
};

export function WarehouseForm({
  defaultValues,
  saleChannels,
  saleChannelsPending = false,
  onSubmit,
  onCancel,
}: Props) {
  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseCreateSchema) as Resolver<WarehouseFormValues>,
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });
  const saleChannelItems = [
    { value: NO_SALE_CHANNEL_ID, label: "No sale channel" },
    ...saleChannels.map((saleChannel) => ({
      value: saleChannel.id,
      label: saleChannel.name,
    })),
  ];

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(onSubmit)(event);
      }}
    >
      <FieldSet className="gap-4">
        <FieldGroup className="gap-4">
          <Field data-invalid={!!form.formState.errors.name} className="gap-1.5">
            <FieldLabel htmlFor="warehouse-name" required>
              Name
            </FieldLabel>
            <FieldContent>
              <Input id="warehouse-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>

          <Field data-invalid={!!form.formState.errors.phoneNumber} className="gap-1.5">
            <FieldLabel htmlFor="warehouse-phone">Phone number</FieldLabel>
            <FieldContent>
              <Input
                id="warehouse-phone"
                {...form.register("phoneNumber")}
                placeholder="+971..."
              />
              <FieldError errors={[form.formState.errors.phoneNumber]} />
            </FieldContent>
          </Field>

          <Field data-invalid={!!form.formState.errors.email} className="gap-1.5">
            <FieldLabel htmlFor="warehouse-email">Email</FieldLabel>
            <FieldContent>
              <Input
                id="warehouse-email"
                type="email"
                {...form.register("email")}
                placeholder="ops@example.com"
              />
              <FieldError errors={[form.formState.errors.email]} />
            </FieldContent>
          </Field>

          <Field data-invalid={!!form.formState.errors.saleChannelId} className="gap-1.5">
            <FieldLabel>Sale channel</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="saleChannelId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NO_SALE_CHANNEL_ID}
                    items={saleChannelItems}
                    disabled={saleChannelsPending}
                    onValueChange={(value) => {
                      field.onChange(value === NO_SALE_CHANNEL_ID ? null : value);
                    }}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue
                        placeholder={saleChannelsPending ? "Loading..." : "Sale channel"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_SALE_CHANNEL_ID}>No sale channel</SelectItem>
                      {saleChannels.map((saleChannel) => (
                        <SelectItem key={saleChannel.id} value={saleChannel.id}>
                          {saleChannel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.saleChannelId]} />
            </FieldContent>
          </Field>

          <Field data-invalid={!!form.formState.errors.address} className="gap-1.5">
            <FieldLabel htmlFor="warehouse-address">Address</FieldLabel>
            <FieldContent>
              <Textarea
                id="warehouse-address"
                rows={3}
                {...form.register("address")}
                placeholder="Street, city..."
              />
              <FieldError errors={[form.formState.errors.address]} />
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>

      <DialogFooter className="mt-4 border-0 bg-transparent">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
