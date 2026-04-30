"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFormState } from "react-hook-form";
import { z } from "zod";
import { api } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const schema = z.object({
  name: z.string().min(2, "Name needs at least 2 characters"),
  email: z.string().email("Enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

export function ContactDemoForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "" },
  });
  const { isSubmitting } = useFormState({ control: form.control });

  async function onSubmit(values: FormValues) {
    try {
      const { data } = await api.post<{ ok: boolean }>(
        "/api/demo/contact",
        values,
      );
      if (data?.ok) {
        toast.success("Submitted successfully");
        form.reset();
      }
    } catch {
      toast.error("Could not submit — check the console");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldSet className="gap-4 rounded-xl border border-border/80 bg-card/40 p-4">
        <FieldLegend className="text-base font-semibold">
          React Hook Form + Zod
        </FieldLegend>
        <FieldGroup className="gap-4">
          <Field
            data-invalid={!!form.formState.errors.name}
            className="gap-1.5"
          >
            <FieldLabel htmlFor="demo-name" required>Name</FieldLabel>
            <FieldContent>
              <Input
                id="demo-name"
                autoComplete="name"
                {...form.register("name")}
              />
              <FieldDescription>Shown on invoices and emails.</FieldDescription>
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <Field
            data-invalid={!!form.formState.errors.email}
            className="gap-1.5"
          >
            <FieldLabel htmlFor="demo-email" required>Email</FieldLabel>
            <FieldContent>
              <Input
                id="demo-email"
                type="email"
                autoComplete="email"
                {...form.register("email")}
              />
              <FieldDescription>We never sell your address.</FieldDescription>
              <FieldError errors={[form.formState.errors.email]} />
            </FieldContent>
          </Field>
        </FieldGroup>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Sending
            </>
          ) : (
            "Submit via Axios"
          )}
        </Button>
      </FieldSet>
    </form>
  );
}
