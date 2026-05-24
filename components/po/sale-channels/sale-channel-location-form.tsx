"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm, useFormState, useWatch, type Resolver } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  CountrySelect,
  isUnitedStatesCountry,
  UNITED_STATES_COUNTRY,
  UsStateSelect,
} from "@/components/ui/country-state-select";
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
import { PhoneNumberInput } from "@/components/ui/phone-number-input";
import { Textarea } from "@/components/ui/textarea";
import type { SaleChannelLocation } from "@/lib/types/api";
import { saleChannelLocationCreateSchema } from "@/lib/validations/master-data";

export type SaleChannelLocationFormValues = z.infer<typeof saleChannelLocationCreateSchema>;

export function emptySaleChannelLocationValues(): SaleChannelLocationFormValues {
  return {
    name: "",
    recipientName: "",
    companyName: "",
    phoneNumber: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateProvince: "",
    postalCode: "",
    country: UNITED_STATES_COUNTRY,
    shippingNotes: "",
  };
}

export function saleChannelLocationValuesFromLocation(
  location: SaleChannelLocation,
): SaleChannelLocationFormValues {
  return {
    name: location.name,
    recipientName: location.recipientName,
    companyName: location.companyName ?? "",
    phoneNumber: location.phoneNumber ?? "",
    email: location.email ?? "",
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2 ?? "",
    city: location.city,
    stateProvince: location.stateProvince ?? "",
    postalCode: location.postalCode ?? "",
    country: location.country,
    shippingNotes: location.shippingNotes ?? "",
  };
}

type Props = {
  defaultValues: SaleChannelLocationFormValues;
  onSubmit: (values: SaleChannelLocationFormValues) => Promise<void>;
  onCancel: () => void;
};

export function SaleChannelLocationForm({ defaultValues, onSubmit, onCancel }: Props) {
  const form = useForm<SaleChannelLocationFormValues>({
    resolver: zodResolver(saleChannelLocationCreateSchema) as Resolver<SaleChannelLocationFormValues>,
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });
  const selectedCountry = useWatch({ control: form.control, name: "country" });
  const isUnitedStates = isUnitedStatesCountry(selectedCountry);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        void form.handleSubmit(onSubmit)(event);
      }}
    >
      <FieldSet>
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="scl-name" required>Location Name</FieldLabel>
            <FieldContent>
              <Input id="scl-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.recipientName}>
            <FieldLabel htmlFor="scl-recipient" required>Recipient</FieldLabel>
            <FieldContent>
              <Input id="scl-recipient" {...form.register("recipientName")} />
              <FieldError errors={[form.formState.errors.recipientName]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.companyName}>
            <FieldLabel htmlFor="scl-company">Company</FieldLabel>
            <FieldContent>
              <Input id="scl-company" {...form.register("companyName")} />
              <FieldError errors={[form.formState.errors.companyName]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.phoneNumber}>
            <FieldLabel htmlFor="scl-phone">Phone</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <PhoneNumberInput
                    id="scl-phone"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={!!form.formState.errors.phoneNumber}
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.phoneNumber]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.email}>
            <FieldLabel htmlFor="scl-email">Email</FieldLabel>
            <FieldContent>
              <Input id="scl-email" type="email" {...form.register("email")} />
              <FieldError errors={[form.formState.errors.email]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.country}>
            <FieldLabel htmlFor="scl-country" required>Country</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="country"
                render={({ field }) => (
                  <CountrySelect
                    id="scl-country"
                    value={field.value ?? ""}
                    aria-invalid={!!form.formState.errors.country}
                    onValueChange={(value) => {
                      if (value !== field.value) {
                        form.setValue("stateProvince", "", {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                      field.onChange(value);
                    }}
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.country]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.addressLine1} className="md:col-span-2">
            <FieldLabel htmlFor="scl-address1" required>Address line 1</FieldLabel>
            <FieldContent>
              <Input id="scl-address1" {...form.register("addressLine1")} />
              <FieldError errors={[form.formState.errors.addressLine1]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.addressLine2} className="md:col-span-2">
            <FieldLabel htmlFor="scl-address2">Address line 2</FieldLabel>
            <FieldContent>
              <Input id="scl-address2" {...form.register("addressLine2")} />
              <FieldError errors={[form.formState.errors.addressLine2]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.city}>
            <FieldLabel htmlFor="scl-city" required>City</FieldLabel>
            <FieldContent>
              <Input id="scl-city" {...form.register("city")} />
              <FieldError errors={[form.formState.errors.city]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.stateProvince}>
            <FieldLabel htmlFor="scl-state">State / Province</FieldLabel>
            <FieldContent>
              {isUnitedStates ? (
                <Controller
                  control={form.control}
                  name="stateProvince"
                  render={({ field }) => (
                    <UsStateSelect
                      id="scl-state"
                      value={field.value ?? ""}
                      aria-invalid={!!form.formState.errors.stateProvince}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              ) : (
                <Input id="scl-state" {...form.register("stateProvince")} />
              )}
              <FieldError errors={[form.formState.errors.stateProvince]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.postalCode}>
            <FieldLabel htmlFor="scl-postal">Postal code</FieldLabel>
            <FieldContent>
              <Input id="scl-postal" {...form.register("postalCode")} />
              <FieldError errors={[form.formState.errors.postalCode]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.shippingNotes} className="md:col-span-2">
            <FieldLabel htmlFor="scl-notes">Shipping notes</FieldLabel>
            <FieldContent>
              <Textarea id="scl-notes" rows={3} {...form.register("shippingNotes")} />
              <FieldError errors={[form.formState.errors.shippingNotes]} />
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
      <DialogFooter className="border-0 bg-transparent">
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
