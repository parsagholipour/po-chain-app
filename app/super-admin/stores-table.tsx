"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useForm, useFormState, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { updateSuperAdminStore, type SuperAdminStoreUpdate } from "./actions";
import {
  superAdminStoreUpdateSchema,
  type SuperAdminStoreFormValues,
} from "@/lib/validations/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type SuperAdminStoreRow = SuperAdminStoreUpdate & {
  createdAtLabel: string;
  userCount: number;
};

type StoresTableProps = {
  stores: SuperAdminStoreRow[];
};

function sortStores(rows: SuperAdminStoreRow[]) {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function StoreEditDialog({
  open,
  store,
  onOpenChange,
  setStores,
}: {
  open: boolean;
  store: SuperAdminStoreRow | null;
  onOpenChange: (open: boolean) => void;
  setStores: Dispatch<SetStateAction<SuperAdminStoreRow[]>>;
}) {
  const defaultValues = useMemo<SuperAdminStoreFormValues>(
    () => ({
      name: store?.name ?? "",
      slug: store?.slug ?? "",
      email: store?.email ?? "",
      website: store?.website ?? "",
    }),
    [store],
  );

  const form = useForm<SuperAdminStoreFormValues>({
    resolver: zodResolver(superAdminStoreUpdateSchema) as Resolver<SuperAdminStoreFormValues>,
    defaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });

  useEffect(() => {
    if (open) form.reset(defaultValues);
  }, [defaultValues, form, open]);

  async function handleSubmit(values: SuperAdminStoreFormValues) {
    if (!store) return;

    try {
      const result = await updateSuperAdminStore(store.id, values);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      setStores((current) =>
        sortStores(
          current.map((row) =>
            row.id === result.store.id ? { ...row, ...result.store } : row,
          ),
        ),
      );
      toast.success("Store updated");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update store");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit store</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <FieldSet className="gap-4">
            <FieldGroup className="gap-4">
              <Field data-invalid={!!form.formState.errors.name} className="gap-1.5">
                <FieldLabel htmlFor="store-name">Name</FieldLabel>
                <FieldContent>
                  <Input id="store-name" {...form.register("name")} />
                  <FieldError errors={[form.formState.errors.name]} />
                </FieldContent>
              </Field>

              <Field data-invalid={!!form.formState.errors.slug} className="gap-1.5">
                <FieldLabel htmlFor="store-slug">Slug</FieldLabel>
                <FieldContent>
                  <Input id="store-slug" {...form.register("slug")} />
                  <FieldError errors={[form.formState.errors.slug]} />
                </FieldContent>
              </Field>

              <Field data-invalid={!!form.formState.errors.email} className="gap-1.5">
                <FieldLabel htmlFor="store-email">Email</FieldLabel>
                <FieldContent>
                  <Input
                    id="store-email"
                    type="email"
                    placeholder="name@example.com"
                    {...form.register("email")}
                  />
                  <FieldError errors={[form.formState.errors.email]} />
                </FieldContent>
              </Field>

              <Field data-invalid={!!form.formState.errors.website} className="gap-1.5">
                <FieldLabel htmlFor="store-website">Website</FieldLabel>
                <FieldContent>
                  <Input
                    id="store-website"
                    placeholder="https://example.com"
                    {...form.register("website")}
                  />
                  <FieldError errors={[form.formState.errors.website]} />
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldSet>

          <DialogFooter className="mt-4 border-0 bg-transparent">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuperAdminStoresTable({ stores: initialStores }: StoresTableProps) {
  const [stores, setStores] = useState(() => sortStores(initialStores));
  const [editingStore, setEditingStore] = useState<SuperAdminStoreRow | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setStores(sortStores(initialStores));
  }, [initialStores]);

  function openEditor(store: SuperAdminStoreRow) {
    setEditingStore(store);
    setOpen(true);
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Website</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-16 text-right">Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((store) => (
              <TableRow key={store.id}>
                <TableCell className="font-medium">{store.name}</TableCell>
                <TableCell className="font-mono text-xs">{store.slug}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {store.email ?? "-"}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {store.website ?? "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {store.userCount}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {store.createdAtLabel}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${store.name}`}
                    title="Edit store"
                    onClick={() => openEditor(store)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <StoreEditDialog
        open={open}
        store={editingStore}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditingStore(null);
        }}
        setStores={setStores}
      />
    </>
  );
}
