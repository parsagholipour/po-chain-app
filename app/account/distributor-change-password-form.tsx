"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFormState, type Resolver } from "react-hook-form";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import {
  distributorChangePasswordSchema,
  type DistributorChangePasswordInput,
} from "@/lib/validations/account";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const defaultValues: DistributorChangePasswordInput = {
  newPassword: "",
  confirmPassword: "",
};

export function DistributorChangePasswordForm() {
  const form = useForm<DistributorChangePasswordInput>({
    resolver: zodResolver(distributorChangePasswordSchema) as Resolver<
      DistributorChangePasswordInput
    >,
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });

  async function handleSubmit(values: DistributorChangePasswordInput) {
    try {
      await api.post("/api/distributor/change-password", values);
      form.reset(defaultValues);
      toast.success("Password changed");
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        void form.handleSubmit(handleSubmit)(event);
      }}
    >
      <FieldGroup className="gap-4">
        <Field
          data-invalid={!!form.formState.errors.newPassword}
          className="gap-1.5"
        >
          <FieldLabel htmlFor="distributor-new-password">New password</FieldLabel>
          <FieldContent>
            <Input
              id="distributor-new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!form.formState.errors.newPassword}
              {...form.register("newPassword")}
            />
            <FieldError errors={[form.formState.errors.newPassword]} />
          </FieldContent>
        </Field>
        <Field
          data-invalid={!!form.formState.errors.confirmPassword}
          className="gap-1.5"
        >
          <FieldLabel htmlFor="distributor-confirm-password">
            Confirm password
          </FieldLabel>
          <FieldContent>
            <Input
              id="distributor-confirm-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!form.formState.errors.confirmPassword}
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[form.formState.errors.confirmPassword]} />
          </FieldContent>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <KeyRound className="size-4" />
        )}
        Change password
      </Button>
    </form>
  );
}
