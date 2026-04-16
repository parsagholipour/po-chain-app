"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/axios";
import type {
  CustomFieldDefinition,
  CustomFieldValuesResponse,
} from "@/lib/types/api";
import { uploadFileToStorage } from "@/lib/upload-client";

export type CustomFieldEntityType =
  | "product"
  | "product_category"
  | "manufacturer"
  | "sale_channel"
  | "logistics_partner"
  | "shipping";

type FieldState = Record<
  string,
  {
    textValue?: string | null;
    numberValue?: number | null;
    dateValue?: string | null;
    booleanValue?: boolean | null;
    fileKey?: string | null;
    /** Local file pending upload (for file/image types). */
    pendingFile?: File | null;
    /** When true, the stored file should be removed on save. */
    removeStored?: boolean;
  }
>;

export function useCustomFields(
  entityType: CustomFieldEntityType,
  entityId: string | null | undefined,
) {
  const [values, setValues] = useState<FieldState>({});
  const initializedRef = useRef(false);

  const { data: definitions = [], isPending: definitionsLoading } = useQuery({
    queryKey: ["custom-field-definitions", entityType],
    queryFn: async () => {
      const { data } = await api.get<CustomFieldDefinition[]>(
        `/api/custom-fields/definitions?entityType=${entityType}`,
      );
      return data;
    },
  });

  const { data: existingValues, isPending: valuesLoading } = useQuery({
    queryKey: ["custom-field-values", entityType, entityId],
    queryFn: async () => {
      const { data } = await api.get<CustomFieldValuesResponse>(
        `/api/custom-fields/values/${entityType}/${entityId}`,
      );
      return data;
    },
    enabled: !!entityId,
  });

  useEffect(() => {
    if (initializedRef.current) return;
    if (definitionsLoading) return;
    if (entityId && valuesLoading) return;

    const state: FieldState = {};
    for (const def of definitions) {
      const existing = existingValues?.values.find(
        (v) => v.definitionId === def.id,
      );
      state[def.id] = {
        textValue: existing?.textValue ?? null,
        numberValue:
          existing?.numberValue != null ? Number(existing.numberValue) : null,
        dateValue: existing?.dateValue ?? null,
        booleanValue: existing?.booleanValue ?? null,
        fileKey: existing?.fileKey ?? null,
      };
    }
    setValues(state);
    initializedRef.current = true;
  }, [definitions, definitionsLoading, entityId, existingValues, valuesLoading]);

  const setValue = useCallback(
    (definitionId: string, patch: Partial<FieldState[string]>) => {
      setValues((prev) => ({
        ...prev,
        [definitionId]: { ...prev[definitionId], ...patch },
      }));
    },
    [],
  );

  const save = useCallback(
    async (targetEntityId: string) => {
      const items: {
        definitionId: string;
        textValue?: string | null;
        numberValue?: number | null;
        dateValue?: string | null;
        booleanValue?: boolean | null;
        fileKey?: string | null;
      }[] = [];

      for (const def of definitions) {
        const v = values[def.id];
        if (!v) continue;

        let fileKey = v.fileKey ?? null;
        if (v.pendingFile) {
          fileKey = await uploadFileToStorage(
            v.pendingFile,
            `custom-fields/${entityType}`,
          );
        } else if (v.removeStored) {
          fileKey = null;
        }

        items.push({
          definitionId: def.id,
          textValue: v.textValue,
          numberValue: v.numberValue,
          dateValue: v.dateValue,
          booleanValue: v.booleanValue,
          fileKey,
        });
      }

      if (items.length > 0) {
        await api.put(
          `/api/custom-fields/values/${entityType}/${targetEntityId}`,
          { values: items },
        );
      }
    },
    [definitions, values, entityType],
  );

  const isLoading = definitionsLoading || (!!entityId && valuesLoading);

  return {
    definitions,
    values,
    setValue,
    save,
    isLoading,
  };
}
