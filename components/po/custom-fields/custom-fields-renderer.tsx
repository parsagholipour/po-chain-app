"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  Fragment,
  useMemo,
} from "react";
import {
  Field,
  FieldContent,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageFileInput } from "@/components/ui/image-file-input";
import { RequiredIndicator } from "@/components/ui/label";
import { StorageObjectLink } from "@/components/ui/storage-object-link";
import { Button } from "@/components/ui/button";
import type { CustomFieldDefinition, CustomFieldCondition } from "@/lib/types/api";
import {
  useCustomFields,
  type CustomFieldEntityType,
} from "./use-custom-fields";

export type CustomFieldsHandle = {
  save: (entityId: string) => Promise<void>;
  hasFields: boolean;
};

type FieldValue = {
  textValue?: string | null;
  numberValue?: number | null;
  dateValue?: string | null;
  booleanValue?: boolean | null;
  fileKey?: string | null;
  pendingFile?: File | null;
  removeStored?: boolean;
};

type Props = {
  entityType: CustomFieldEntityType;
  entityId?: string | null;
  disabled?: boolean;
  nativeValues?: Record<string, unknown>;
};

function resolveFieldValue(
  sourceField: string,
  nativeValues: Record<string, unknown>,
  customFieldValues: Record<string, FieldValue | undefined>,
  definitions: CustomFieldDefinition[],
): unknown {
  if (sourceField.startsWith("custom:")) {
    const key = sourceField.slice(7);
    const def = definitions.find((d) => d.fieldKey === key);
    if (!def) return undefined;
    const v = customFieldValues[def.id];
    if (!v) return undefined;
    switch (def.type) {
      case "text": return v.textValue;
      case "number": return v.numberValue;
      case "date": return v.dateValue;
      case "boolean": return v.booleanValue;
      case "file":
      case "image": return v.fileKey ?? v.pendingFile;
    }
  }
  return nativeValues[sourceField];
}

function evaluateCondition(
  condition: CustomFieldCondition,
  nativeValues: Record<string, unknown>,
  customFieldValues: Record<string, FieldValue | undefined>,
  definitions: CustomFieldDefinition[],
): boolean {
  const raw = resolveFieldValue(
    condition.sourceField,
    nativeValues,
    customFieldValues,
    definitions,
  );

  const { operator, value: compareStr } = condition;

  if (operator === "is_empty") {
    return raw === null || raw === undefined || raw === "";
  }
  if (operator === "not_empty") {
    return raw !== null && raw !== undefined && raw !== "";
  }

  if (typeof raw === "boolean") {
    const compareBool = compareStr === "true" || compareStr === "1";
    return operator === "equals"
      ? raw === compareBool
      : operator === "not_equals"
        ? raw !== compareBool
        : false;
  }

  if (typeof raw === "number" || (typeof raw === "string" && !isNaN(Number(raw)) && raw !== "")) {
    const numRaw = typeof raw === "number" ? raw : Number(raw);
    const numCmp = Number(compareStr);
    if (!isNaN(numCmp)) {
      switch (operator) {
        case "equals": return numRaw === numCmp;
        case "not_equals": return numRaw !== numCmp;
        case "greater_than": return numRaw > numCmp;
        case "less_than": return numRaw < numCmp;
        case "greater_than_or_equal": return numRaw >= numCmp;
        case "less_than_or_equal": return numRaw <= numCmp;
        case "contains": return String(numRaw).includes(compareStr);
      }
    }
  }

  const strRaw = String(raw ?? "");
  switch (operator) {
    case "equals": return strRaw === compareStr;
    case "not_equals": return strRaw !== compareStr;
    case "greater_than": return strRaw > compareStr;
    case "less_than": return strRaw < compareStr;
    case "greater_than_or_equal": return strRaw >= compareStr;
    case "less_than_or_equal": return strRaw <= compareStr;
    case "contains": return strRaw.includes(compareStr);
    default: return false;
  }
}

function shouldShowField(
  definition: CustomFieldDefinition,
  nativeValues: Record<string, unknown>,
  customFieldValues: Record<string, FieldValue | undefined>,
  definitions: CustomFieldDefinition[],
): boolean {
  const conditions = definition.conditions;
  if (!conditions || conditions.length === 0) return true;

  const results = conditions.map((c) =>
    evaluateCondition(c, nativeValues, customFieldValues, definitions),
  );

  return definition.conditionLogic === "or"
    ? results.some(Boolean)
    : results.every(Boolean);
}

function FileFieldInput({
  definitionId,
  storedKey,
  disabled,
  onFileChange,
  onRemoveStored,
}: {
  definitionId: string;
  storedKey: string | null;
  disabled?: boolean;
  onFileChange: (file: File | null) => void;
  onRemoveStored: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [localFile, setLocalFile] = useState<File | null>(null);

  return (
    <FieldContent>
      <Input
        ref={ref}
        type="file"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          setLocalFile(file);
          onFileChange(file);
        }}
      />
      {localFile ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Selected:{" "}
          <span className="font-medium text-foreground">{localFile.name}</span>
        </p>
      ) : storedKey ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <StorageObjectLink reference={storedKey} label="Open file" />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {storedKey && !localFile ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onRemoveStored();
              if (ref.current) ref.current.value = "";
            }}
          >
            Remove file
          </Button>
        ) : null}
        {localFile ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              setLocalFile(null);
              onFileChange(null);
              if (ref.current) ref.current.value = "";
            }}
          >
            Clear new file
          </Button>
        ) : null}
      </div>
    </FieldContent>
  );
}

export const CustomFieldsRenderer = forwardRef<CustomFieldsHandle, Props>(
  function CustomFieldsRenderer({ entityType, entityId, disabled, nativeValues = {} }, ref) {
    const { definitions, values, setValue, save, isLoading } = useCustomFields(
      entityType,
      entityId,
    );

    useImperativeHandle(
      ref,
      () => ({
        save,
        hasFields: definitions.length > 0,
      }),
      [save, definitions.length],
    );

    const visibleDefinitions = useMemo(
      () =>
        definitions.filter((def) =>
          shouldShowField(def, nativeValues, values, definitions),
        ),
      [definitions, nativeValues, values],
    );

    if (isLoading || definitions.length === 0) return null;

    return (
      <>
        {visibleDefinitions.map((def) => (
          <Fragment key={def.id}>
            <CustomField
              definition={def}
              value={values[def.id]}
              disabled={disabled}
              onChange={(patch) => setValue(def.id, patch)}
            />
          </Fragment>
        ))}
      </>
    );
  },
);

function CustomField({
  definition,
  value,
  disabled,
  onChange,
}: {
  definition: CustomFieldDefinition;
  value: FieldValue | undefined;
  disabled?: boolean;
  onChange: (patch: Partial<FieldValue>) => void;
}) {
  const fieldId = `cf-${definition.fieldKey}`;

  switch (definition.type) {
    case "text":
      return (
        <Field className="gap-1.5">
          <FieldLabel htmlFor={fieldId} required={definition.required}>
            {definition.name}
          </FieldLabel>
          <FieldContent>
            <Input
              id={fieldId}
              disabled={disabled}
              value={value?.textValue ?? ""}
              onChange={(e) => onChange({ textValue: e.target.value })}
              placeholder={definition.required ? undefined : "Optional"}
            />
          </FieldContent>
        </Field>
      );

    case "number":
      return (
        <Field className="gap-1.5">
          <FieldLabel htmlFor={fieldId} required={definition.required}>
            {definition.name}
          </FieldLabel>
          <FieldContent>
            <Input
              id={fieldId}
              type="number"
              disabled={disabled}
              value={value?.numberValue ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({
                  numberValue: raw === "" ? null : Number(raw),
                });
              }}
              placeholder={definition.required ? undefined : "Optional"}
            />
          </FieldContent>
        </Field>
      );

    case "date":
      return (
        <Field className="gap-1.5">
          <FieldLabel htmlFor={fieldId} required={definition.required}>
            {definition.name}
          </FieldLabel>
          <FieldContent>
            <Input
              id={fieldId}
              type="date"
              disabled={disabled}
              value={formatDateInput(value?.dateValue)}
              onChange={(e) =>
                onChange({
                  dateValue: e.target.value || null,
                })
              }
            />
          </FieldContent>
        </Field>
      );

    case "boolean":
      return (
        <Field orientation="horizontal" className="gap-2">
          <Checkbox
            id={fieldId}
            disabled={disabled}
            checked={value?.booleanValue ?? false}
            onCheckedChange={(v) =>
              onChange({ booleanValue: v === true })
            }
            label={
              <span className="inline-flex items-baseline gap-0.5 font-normal">
                {definition.name}
                {definition.required ? <RequiredIndicator /> : null}
              </span>
            }
          />
        </Field>
      );

    case "image": {
      const storedKey =
        value?.removeStored || value?.pendingFile
          ? null
          : (value?.fileKey ?? null);

      return (
        <Field className="gap-1.5">
          <ImageFileInput
            id={fieldId}
            label={definition.name}
            required={definition.required}
            variant="image"
            disabled={disabled}
            value={value?.pendingFile ?? null}
            onChange={(file) => {
              onChange({
                pendingFile: file,
                removeStored: false,
              });
            }}
            existingObjectKey={storedKey}
            onRemoveStored={
              value?.fileKey
                ? () =>
                    onChange({
                      pendingFile: null,
                      removeStored: true,
                      fileKey: null,
                    })
                : undefined
            }
            chooseLabel={
              storedKey ? "Replace image" : "Choose image"
            }
          />
        </Field>
      );
    }

    case "file": {
      const storedKey =
        value?.removeStored || value?.pendingFile
          ? null
          : (value?.fileKey ?? null);

      return (
        <Field className="gap-1.5">
          <FieldLabel required={definition.required}>{definition.name}</FieldLabel>
          <FileFieldInput
            definitionId={definition.id}
            storedKey={storedKey}
            disabled={disabled}
            onFileChange={(file) =>
              onChange({
                pendingFile: file,
                removeStored: false,
              })
            }
            onRemoveStored={() =>
              onChange({
                pendingFile: null,
                removeStored: true,
                fileKey: null,
              })
            }
          />
        </Field>
      );
    }

    default:
      return null;
  }
}

function formatDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
