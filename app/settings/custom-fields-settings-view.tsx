"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/axios";
import { apiErrorMessage } from "@/lib/api-error-message";
import type { CustomFieldDefinition } from "@/lib/types/api";
import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/ui/table-pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FieldDefinitionUpsertDialog } from "./field-definition-upsert-dialog";
import { useConfirm } from "@/components/confirm-provider";
import { usePagination } from "@/hooks/use-pagination";

const ENTITY_TYPES = [
  { value: "product", label: "Products" },
  { value: "product_category", label: "Product Categories" },
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
      <div className="mb-4 flex items-center justify-between">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium">Name</th>
                <th className="px-4 py-2.5 text-left font-medium">Key</th>
                <th className="px-4 py-2.5 text-left font-medium">Type</th>
                <th className="px-4 py-2.5 text-left font-medium">Required</th>
                <th className="px-4 py-2.5 text-left font-medium">Conditions</th>
                <th className="px-4 py-2.5 text-left font-medium">Order</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedDefinitions.map((def) => (
                <tr key={def.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{def.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {def.fieldKey}
                  </td>
                  <td className="px-4 py-2.5">
                    <FieldTypeLabel type={def.type} />
                  </td>
                  <td className="px-4 py-2.5">{def.required ? "Yes" : "No"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {def.conditions?.length
                      ? `${def.conditions.length} (${def.conditionLogic.toUpperCase()})`
                      : "None"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{def.sortOrder}</td>
                  <td className="px-4 py-2.5 text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

export function CustomFieldsSettingsView() {
  const [activeTab, setActiveTab] = useState<EntityTypeValue>("product");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage custom fields that appear on your entity forms.
        </p>
      </div>

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
