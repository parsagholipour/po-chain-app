"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Upload } from "lucide-react";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import {
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { cn } from "@/lib/utils";

export type ImageFileInputVariant = "image" | "logo";

function defaultCopy(variant: ImageFileInputVariant, useReplaceWording: boolean) {
  const noun = variant === "logo" ? "logo" : "image";
  return {
    emptyLabel: `No ${noun}`,
    chooseLabel: useReplaceWording ? `Replace ${noun}` : `Choose ${noun}`,
    removeStoredLabel: `Remove ${noun}`,
    hint:
      variant === "logo"
        ? "Optional. Remove clears the logo when you save."
        : "Optional. Remove clears the image when you save.",
  };
}

function fileMatchesAccept(file: File, accept: string): boolean {
  if (!accept || accept === "image/*") {
    return file.type.startsWith("image/");
  }
  const tokens = accept.split(",").map((t) => t.trim().toLowerCase());
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    if (token === "image/*") return type.startsWith("image/");
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1);
      return type.startsWith(prefix);
    }
    if (token.startsWith(".")) {
      return name.endsWith(token);
    }
    return type === token;
  });
}

export type ImageFileInputProps = {
  id?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  className?: string;
  /** Remote URL when no new file is selected (e.g. presigned URL). */
  existingPreviewUrl?: string | null;
  /** Storage object key; presigned URL is fetched when no new file is selected. */
  existingObjectKey?: string | null;
  /** Remove saved image in the database when the form is submitted (parent clears `existingObjectKey` after this). */
  onRemoveStored?: () => void;
  /** Shown in the field header; pairs with default hint unless overridden. */
  label?: string;
  required?: boolean;
  labelClassName?: string;
  /**
   * Helper under the control. Default when `label` is set; omit both for a bare control.
   * Pass `null` or `false` to hide.
   */
  description?: string | null | false;
  variant?: ImageFileInputVariant;
  chooseLabel?: string;
  emptyLabel?: string;
  discardLabel?: string;
  removeStoredLabel?: string;
  disabled?: boolean;
};

/**
 * Preview + picker for a storage reference string. `/api/storage/upload` returns `key` with
 * `?width=&height=` for images; parse via `parseStoredImageReference` from `@/lib/upload-client`.
 */
export function ImageFileInput({
  id,
  value,
  onChange,
  accept = "image/*",
  className,
  existingPreviewUrl,
  existingObjectKey,
  onRemoveStored,
  label,
  required,
  labelClassName,
  description,
  variant = "image",
  chooseLabel: chooseLabelProp,
  emptyLabel: emptyLabelProp,
  discardLabel = "Discard",
  removeStoredLabel: removeStoredLabelProp,
  disabled,
}: ImageFileInputProps) {
  const confirm = useConfirm();
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => {
    if (!disabled) fileInputRef.current?.click();
  }, [disabled]);

  const objectUrl = useMemo(() => {
    if (!value) return null;
    return URL.createObjectURL(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!value && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [value]);

  const previewSrc = objectUrl ?? (!value ? existingPreviewUrl : null) ?? null;
  const showFileOrUrlPreview = Boolean(previewSrc);
  const showKeyPreview =
    Boolean(existingObjectKey) && !value && !existingPreviewUrl;
  const hasStoredToRemove =
    Boolean(onRemoveStored) &&
    !value &&
    (existingObjectKey != null || existingPreviewUrl != null);

  /** Replace vs choose when parent does not pass `chooseLabel` (key/preview only; not `value`). */
  const hasReplaceWording =
    Boolean(existingObjectKey) || Boolean(existingPreviewUrl);
  const copy = defaultCopy(variant, hasReplaceWording);

  const emptyLabel = emptyLabelProp ?? copy.emptyLabel;
  const chooseLabel = chooseLabelProp ?? copy.chooseLabel;
  const removeStoredLabel = removeStoredLabelProp ?? copy.removeStoredLabel;

  const resolvedDescription =
    description === false || description === null
      ? null
      : typeof description === "string"
        ? description
        : label && !required
          ? copy.hint
          : null;

  const applyFile = useCallback(
    (file: File | null) => {
      if (!file || !fileMatchesAccept(file, accept)) return;
      onChange(file);
    },
    [accept, onChange],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      if (f) applyFile(f);
      e.target.value = "";
    },
    [applyFile],
  );

  const discardFile = useCallback(() => {
    onChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [onChange]);

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setIsDragging(false);
  }, []);

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) applyFile(f);
    },
    [applyFile, disabled],
  );

  const hasVisualPreview = showFileOrUrlPreview || showKeyPreview;

  const previewButton = (
    <button
      type="button"
      disabled={disabled}
      onClick={openPicker}
      aria-label={
        hasVisualPreview
          ? `${chooseLabel}. Current preview shown.`
          : `${chooseLabel}. ${emptyLabel}`
      }
      className={cn(
        "relative flex justify-center size-20 shrink-0 cursor-pointer items-center overflow-hidden rounded-lg border border-border/80 bg-muted/50 text-left outline-none transition-[box-shadow,background-color,border-color]",
        "hover:border-primary/35 hover:bg-muted/70",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:pointer-events-none disabled:opacity-50",
        hasVisualPreview ? "border-transparent p-0.5 ring-1 ring-border/50" : "p-2",
        isDragging && !disabled && "border-primary bg-primary/5 ring-2 ring-primary/25",
      )}
    >
      {showFileOrUrlPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc!}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      ) : showKeyPreview ? (
        <StorageObjectImage
          reference={existingObjectKey ?? null}
          className="w-full h-full inset-1 rounded-md ring-0"
          imgClassName="rounded-md"
          objectFit="contain"
          aspectFallback="1 / 1"
          fallback={
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <ImageIcon className="size-6 opacity-55" strokeWidth={1.25} />
              <span className="sr-only">{emptyLabel}</span>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <ImageIcon className="size-6 opacity-55" strokeWidth={1.25} />
          <span className="sr-only">{emptyLabel}</span>
        </div>
      )}
    </button>
  );

  const card = (
    <div
      role="group"
      aria-label={label ?? (variant === "logo" ? "Logo" : "Image")}
      className={cn(
        "rounded-xl border border-border bg-card/50 p-3 shadow-sm transition-[border-color,box-shadow]",
        isDragging && !disabled && "border-primary/40 ring-2 ring-primary/15",
        className,
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
        {previewButton}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          {!disabled ? (
            <>
              <p className="text-muted-foreground text-xs leading-snug sm:hidden">
                Tap the preview or use the button to choose a file.
              </p>
              <p className="text-muted-foreground hidden text-xs leading-snug sm:block">
                Drag and drop an image, or use the actions below.
              </p>
            </>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={openPicker}
            >
              <Upload className="size-3.5" />
              {chooseLabel}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={discardFile}
              >
                {discardLabel}
              </Button>
            ) : null}
            {hasStoredToRemove ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  void (async () => {
                    const ok = await confirm({
                      title: `${removeStoredLabel}?`,
                      description: `The stored ${variant === "logo" ? "logo" : "image"} will be cleared when you save this form.`,
                      confirmLabel: "Remove",
                      variant: "destructive",
                    });
                    if (ok) onRemoveStored?.();
                  })();
                }}
              >
                {removeStoredLabel}
              </Button>
            ) : null}
          </div>

          {value ? (
            <p
              className="text-muted-foreground truncate text-xs"
              title={value.name}
            >
              <span className="font-medium text-foreground/80">Selected:</span>{" "}
              {value.name}
            </p>
          ) : null}
        </div>
      </div>

      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={onInputChange}
      />
    </div>
  );

  if (!label && !resolvedDescription) {
    return card;
  }

  return (
    <>
      {label ? (
        <FieldLabel htmlFor={id} required={required} className={labelClassName}>
          {label}
        </FieldLabel>
      ) : null}
      <FieldContent>
        {card}
        {resolvedDescription ? (
          <FieldDescription className="mt-2 text-xs">
            {resolvedDescription}
          </FieldDescription>
        ) : null}
      </FieldContent>
    </>
  );
}
