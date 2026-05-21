"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { CustomFieldDefinition } from "@/lib/types/api";
import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FieldDefinitionUpsertDialog } from "./field-definition-upsert-dialog";
import { useConfirm } from "@/components/confirm-provider";
import { usePagination } from "@/hooks/use-pagination";

const ENTITY_TYPES = [
  { value: "product", label: "Products" },
  { value: "product_category", label: "Product Categories" },
  { value: "product_type", label: "Product Types" },
  { value: "product_collection", label: "Product Collections" },
  { value: "manufacturer", label: "Manufacturers" },
  { value: "sale_channel", label: "Sale Channels" },
  { value: "logistics_partner", label: "Logistics Partners" },
  { value: "shipping", label: "Shipping" },
] as const;

type EntityTypeValue = (typeof ENTITY_TYPES)[number]["value"];

function definitionsKey(entityType: string) {
  return ["custom-field-definitions", entityType] as const;
}

function FieldTypeLabel({ type }: { type: string }) {
  const labels: Record<string, string> = {
    text: "Text",
    number: "Number",
    date: "Date",
    boolean: "Checkbox",
    file: "File",
    image: "Image",
  };
  return <>{labels[type] ?? type}</>;
}

function DefinitionsTable({
  entityType,
}: {
  entityType: EntityTypeValue;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);

  const { data: definitions = [], isPending } = useQuery({
    queryKey: definitionsKey(entityType),
    queryFn: async () => {
      const { data } = await api.get<CustomFieldDefinition[]>(
        `/api/custom-fields/definitions?entityType=${entityType}`,
      );
      return data;
    },
  });
  const pagination = usePagination({ totalItems: definitions.length, resetDeps: [entityType] });
  const pagedDefinitions = pagination.sliceItems(definitions);

  const createMut = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { data } = await api.post<CustomFieldDefinition>(
        "/api/custom-fields/definitions",
        { ...values, entityType },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: definitionsKey(entityType) });
      toast.success("Custom field created");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { data } = await api.patch<CustomFieldDefinition>(
        `/api/custom-fields/definitions/${id}`,
        body,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: definitionsKey(entityType) });
      toast.success("Custom field updated");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/custom-fields/definitions/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: definitionsKey(entityType) });
      toast.success("Custom field deleted");
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e)),
  });

  async function handleSave(values: Record<string, unknown>) {
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, body: values });
    } else {
      await createMut.mutateAsync(values);
    }
  }

  async function handleDelete(def: CustomFieldDefinition) {
    const ok = await confirm({
      title: `Delete "${def.name}"?`,
      description:
        "This will permanently remove this custom field and all stored values for it across all records.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    deleteMut.mutate(def.id);
  }

  if (isPending) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {definitions.length === 0
            ? "No custom fields defined yet."
            : `${definitions.length} custom field${definitions.length > 1 ? "s" : ""}`}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" />
          Add field
        </Button>
      </div>

      {definitions.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedDefinitions.map((def) => (
                <TableRow key={def.id}>
                  <TableCell className="max-w-56 truncate font-medium" title={def.name}>
                    {def.name}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {def.fieldKey}
                  </TableCell>
                  <TableCell>
                    <FieldTypeLabel type={def.type} />
                  </TableCell>
                  <TableCell>{def.required ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {def.conditions?.length
                      ? `${def.conditions.length} (${def.conditionLogic.toUpperCase()})`
                      : "None"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{def.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditing(def);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(def)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t px-3 py-2">
            <TablePagination
              {...pagination}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </div>
        </div>
      )}

      <FieldDefinitionUpsertDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        entityType={entityType}
        siblingDefinitions={definitions}
        onSave={handleSave}
      />
    </div>
  );
}

export function CustomFieldsSettingsView({
  showHeader = true,
}: {
  showHeader?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<EntityTypeValue>("product");

  return (
    <div className="space-y-6">
      {showHeader ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage custom fields that appear on your entity forms.
          </p>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EntityTypeValue)}>
        <TabsList>
          {ENTITY_TYPES.map((et) => (
            <TabsTrigger key={et.value} value={et.value}>
              {et.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {ENTITY_TYPES.map((et) => (
          <TabsContent key={et.value} value={et.value}>
            <DefinitionsTable entityType={et.value} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
