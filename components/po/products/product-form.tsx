"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState, type FormEvent } from "react";
import { Controller, useForm, useFormState, useWatch, type Resolver } from "react-hook-form";
import {
  CustomFieldsRenderer,
  type CustomFieldsHandle,
} from "@/components/po/custom-fields/custom-fields-renderer";
import { z } from "zod";
import { uploadFileToStorage } from "@/lib/upload-client";
import { useConfirm } from "@/components/confirm-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { ImageFileInput } from "@/components/ui/image-file-input";
import { Input } from "@/components/ui/input";
import { PriceField } from "@/components/ui/price-field";
import { StorageObjectLink } from "@/components/ui/storage-object-link";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import type {
  Manufacturer,
  ProductCategory,
  ProductCollection,
  ProductType,
} from "@/lib/types/api";
import {
  productEditingStatusLabels,
  productEditingStatusValues,
} from "@/lib/product-editing-status";
import { storageObjectDisplayName } from "@/lib/storage/display-name";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

function emptyToMoney(value: unknown): unknown {
  if (value === "" || value === undefined) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  return value;
}

function noneToNull(value: unknown): unknown {
  if (value === "none") return null;
  return value;
}

function emptyToNull(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

function emptyToNumber(value: unknown): unknown {
  if (value === "" || value === undefined) return null;
  if (typeof value === "number" && Number.isNaN(value)) return null;
  return value;
}

function optionalNumberLabel(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

const schema = z.object({
  name: z.string().min(1, "Required"),
  sku: z.string().min(1, "Required"),
  upcGtin: z.preprocess(emptyToNull, z.string().nullable().optional()),
  cost: z.preprocess(
    emptyToMoney,
    z.number().nonnegative("Must be zero or greater").nullable().optional(),
  ),
  price: z.preprocess(
    emptyToMoney,
    z.number().nonnegative("Must be zero or greater").nullable().optional(),
  ),
  mop: z.preprocess(
    emptyToNumber,
    z.number().int("Must be a whole number").positive("Must be greater than zero").nullable().optional(),
  ),
  map: z.preprocess(
    emptyToMoney,
    z.number().nonnegative("Must be zero or greater").nullable().optional(),
  ),
  msrp: z.preprocess(
    emptyToMoney,
    z.number().nonnegative("Must be zero or greater").nullable().optional(),
  ),
  quantityPerCarton: z.preprocess(
    emptyToNumber,
    z.number().int("Must be a whole number").positive("Must be greater than zero").nullable().optional(),
  ),
  orderByDate: z.preprocess(emptyToNull, z.string().nullable().optional()),
  editingStatus: z.enum(productEditingStatusValues).nullable().optional(),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  imageLink: z.string(),
  defaultManufacturerId: z.string().uuid(),
  categoryId: z.preprocess(noneToNull, z.string().uuid().nullable().optional()),
  typeId: z.preprocess(noneToNull, z.string().uuid().nullable().optional()),
  collectionId: z.preprocess(noneToNull, z.string().uuid().nullable().optional()),
  verified: z.boolean(),
  imageKey: z.string().nullable().optional(),
  barcodeKey: z.string().nullable().optional(),
  packagingKey: z.string().nullable().optional(),
});

export type ProductFormValues = z.infer<typeof schema>;

type Props = {
  manufacturers: Manufacturer[];
  categories: ProductCategory[];
  productTypes: ProductType[];
  productCollections: ProductCollection[];
  defaultValues: ProductFormValues;
  stockCount?: number | null;
  editingId?: string | null;
  onSubmit: (
    values: ProductFormValues,
    meta: {
      imageChanged: boolean;
      barcodeChanged: boolean;
      packagingChanged: boolean;
    },
  ) => Promise<string>;
  onCancel: () => void;
};

export function ProductForm({
  manufacturers,
  categories,
  productTypes,
  productCollections,
  defaultValues,
  stockCount,
  editingId,
  onSubmit,
  onCancel,
}: Props) {
  const confirm = useConfirm();
  const customFieldsRef = useRef<CustomFieldsHandle>(null);
  const packagingInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeStoredImage, setRemoveStoredImage] = useState(false);
  const [barcodeFile, setBarcodeFile] = useState<File | null>(null);
  const [removeStoredBarcode, setRemoveStoredBarcode] = useState(false);
  const [packagingFile, setPackagingFile] = useState<File | null>(null);
  const [removeStoredPackaging, setRemoveStoredPackaging] = useState(false);
  const normalizedDefaultValues: ProductFormValues = {
    ...defaultValues,
    editingStatus: defaultValues.editingStatus ?? null,
  };

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(schema) as Resolver<ProductFormValues>,
    defaultValues: normalizedDefaultValues,
  });
  const { isSubmitting } = useFormState({ control: form.control });
  const watchedValues = useWatch({ control: form.control });
  const nativeValues = { ...(watchedValues as Record<string, unknown>), stockCount };

  const storedImageKey =
    removeStoredImage || imageFile ? null : (defaultValues.imageKey ?? null);
  const storedBarcodeKey =
    removeStoredBarcode || barcodeFile ? null : (defaultValues.barcodeKey ?? null);
  const storedPackagingKey =
    removeStoredPackaging || packagingFile
      ? null
      : (defaultValues.packagingKey ?? null);
  const packagingDisplayName =
    packagingFile?.name ?? storageObjectDisplayName(storedPackagingKey);

  async function handleSubmit(values: ProductFormValues) {
    let imageKey: string | null;
    if (imageFile) {
      try {
        imageKey = await uploadFileToStorage(imageFile, "products");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return;
      }
    } else if (removeStoredImage) {
      imageKey = null;
    } else {
      imageKey = defaultValues.imageKey ?? null;
    }

    let barcodeKey: string | null;
    if (barcodeFile) {
      try {
        barcodeKey = await uploadFileToStorage(barcodeFile, "products/barcodes");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return;
      }
    } else if (removeStoredBarcode) {
      barcodeKey = null;
    } else {
      barcodeKey = defaultValues.barcodeKey ?? null;
    }

    let packagingKey: string | null;
    if (packagingFile) {
      try {
        packagingKey = await uploadFileToStorage(packagingFile, "products/packaging");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
        return;
      }
    } else if (removeStoredPackaging) {
      packagingKey = null;
    } else {
      packagingKey = defaultValues.packagingKey ?? null;
    }

    const payloadValues = { ...values };
    if (payloadValues.categoryId === "none") {
      payloadValues.categoryId = null;
    }
    if (payloadValues.typeId === "none") {
      payloadValues.typeId = null;
    }
    if (payloadValues.collectionId === "none") {
      payloadValues.collectionId = null;
    }

    const entityId = await onSubmit(
      {
        ...payloadValues,
        imageKey,
        barcodeKey,
        packagingKey,
      },
      {
        imageChanged: imageFile !== null || removeStoredImage,
        barcodeChanged: barcodeFile !== null || removeStoredBarcode,
        packagingChanged: packagingFile !== null || removeStoredPackaging,
      },
    );
    if (customFieldsRef.current?.hasFields) {
      await customFieldsRef.current.save(entityId);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(handleSubmit)(event);
  }

  return (
    <form onSubmit={handleFormSubmit}>
      <FieldSet className="gap-4">
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field data-invalid={!!form.formState.errors.name} className="gap-1.5 md:col-span-2">
            <FieldLabel htmlFor="pf-name" required>Name</FieldLabel>
            <FieldContent>
              <Input id="pf-name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.sku} className="gap-1.5">
            <FieldLabel htmlFor="pf-sku" required>SKU</FieldLabel>
            <FieldContent>
              <Input id="pf-sku" {...form.register("sku")} />
              <FieldError errors={[form.formState.errors.sku]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.cost} className="gap-1.5">
            <FieldLabel htmlFor="pf-cost">Cost</FieldLabel>
            <FieldContent>
              <PriceField
                id="pf-cost"
                placeholder="Optional"
                {...form.register("cost", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.cost]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.price} className="gap-1.5">
            <FieldLabel htmlFor="pf-price">Price</FieldLabel>
            <FieldContent>
              <PriceField
                id="pf-price"
                placeholder="Optional"
                {...form.register("price", { valueAsNumber: true })}
              />
              <FieldError errors={[form.formState.errors.price]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.defaultManufacturerId} className="gap-1.5">
            <FieldLabel required>Default manufacturer</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="defaultManufacturerId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    items={manufacturers.map((m) => ({
                      value: m.id,
                      label: m.name,
                    }))}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Manufacturer" />
                    </SelectTrigger>
                    <SelectContent>
                      {manufacturers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.defaultManufacturerId]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.categoryId} className="gap-1.5">
            <FieldLabel>Category</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? undefined}
                    onValueChange={field.onChange}
                    items={[
                      { value: "none", label: "No category" },
                      ...categories.map((c) => ({
                        value: c.id,
                        label: c.name,
                      })),
                    ]}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Category (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.categoryId]} />
            </FieldContent>
          </Field>
          <Field data-invalid={!!form.formState.errors.typeId} className="gap-1.5">
            <FieldLabel>Type</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="typeId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? undefined}
                    onValueChange={field.onChange}
                    items={[
                      { value: "none", label: "No type" },
                      ...productTypes.map((type) => ({
                        value: type.id,
                        label: type.name,
                      })),
                    ]}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Type (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No type</SelectItem>
                      {productTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.typeId]} />
            </FieldContent>
          </Field>
          <Field className="gap-1.5">
            <ImageFileInput
              id="pf-image"
              label="Image"
              variant="image"
              value={imageFile}
              onChange={(file) => {
                setImageFile(file);
                if (file) setRemoveStoredImage(false);
              }}
              existingObjectKey={storedImageKey}
              onRemoveStored={
                defaultValues.imageKey
                  ? () => {
                      setRemoveStoredImage(true);
                      setImageFile(null);
                    }
                  : undefined
              }
              chooseLabel={
                defaultValues.imageKey && !removeStoredImage
                  ? "Replace image"
                  : "Choose image"
              }
            />
          </Field>
          <Field className="gap-1.5">
            <ImageFileInput
              id="pf-barcode"
              label="Barcode"
              variant="image"
              value={barcodeFile}
              onChange={(file) => {
                setBarcodeFile(file);
                if (file) setRemoveStoredBarcode(false);
              }}
              existingObjectKey={storedBarcodeKey}
              onRemoveStored={
                defaultValues.barcodeKey
                  ? () => {
                      setRemoveStoredBarcode(true);
                      setBarcodeFile(null);
                    }
                  : undefined
              }
              chooseLabel={
                defaultValues.barcodeKey && !removeStoredBarcode
                  ? "Replace barcode"
                  : "Choose barcode"
              }
              removeStoredLabel="Remove barcode"
            />
          </Field>
          <Field className="gap-1.5 md:col-span-2">
            <FieldLabel htmlFor="pf-packaging">Packaging</FieldLabel>
            <FieldContent>
              <Input
                ref={packagingInputRef}
                id="pf-packaging"
                type="file"
                disabled={isSubmitting}
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setPackagingFile(file);
                  if (file) setRemoveStoredPackaging(false);
                }}
              />
              {packagingDisplayName ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">File:</span>
                  <span className="break-all font-medium">{packagingDisplayName}</span>
                  {storedPackagingKey ? (
                    <StorageObjectLink reference={storedPackagingKey} label="Open file" />
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {defaultValues.packagingKey && !packagingFile && !removeStoredPackaging ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: "Remove this packaging file?",
                          description:
                            "The stored packaging file will be cleared when you save this product.",
                          confirmLabel: "Remove",
                          variant: "destructive",
                        });
                        if (!ok) return;
                        setRemoveStoredPackaging(true);
                        setPackagingFile(null);
                        if (packagingInputRef.current) {
                          packagingInputRef.current.value = "";
                        }
                      })();
                    }}
                  >
                    Remove packaging
                  </Button>
                ) : null}
                {packagingFile ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => {
                      setPackagingFile(null);
                      if (packagingInputRef.current) {
                        packagingInputRef.current.value = "";
                      }
                    }}
                  >
                    Clear new file
                  </Button>
                ) : null}
              </div>
            </FieldContent>
          </Field>
          <Field orientation="horizontal" className="gap-2 md:self-end md:pb-1">
            <Controller
              control={form.control}
              name="verified"
              render={({ field }) => (
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  label={<span className="font-normal">Verified</span>}
                />
              )}
            />
          </Field>
          <FieldSet className="gap-4 border-t pt-4 md:col-span-2">
            <FieldLegend>Distribution Info</FieldLegend>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.upcGtin} className="gap-1.5">
                <FieldLabel htmlFor="pf-upc-gtin">UPC/GTIN</FieldLabel>
                <FieldContent>
                  <Input id="pf-upc-gtin" placeholder="Optional" {...form.register("upcGtin")} />
                  <FieldError errors={[form.formState.errors.upcGtin]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.map} className="gap-1.5">
                <FieldLabel htmlFor="pf-map">MAP</FieldLabel>
                <FieldContent>
                  <PriceField
                    id="pf-map"
                    placeholder="Optional"
                    {...form.register("map", { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.map]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.msrp} className="gap-1.5">
                <FieldLabel htmlFor="pf-msrp">MSRP</FieldLabel>
                <FieldContent>
                  <PriceField
                    id="pf-msrp"
                    placeholder="Optional"
                    {...form.register("msrp", { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.msrp]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.mop} className="gap-1.5">
                <FieldLabel htmlFor="pf-mop">MOP</FieldLabel>
                <FieldContent>
                  <Input
                    id="pf-mop"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    placeholder="Optional"
                    {...form.register("mop", { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.mop]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.quantityPerCarton} className="gap-1.5">
                <FieldLabel htmlFor="pf-quantity-per-carton">Quantity per carton</FieldLabel>
                <FieldContent>
                  <Input
                    id="pf-quantity-per-carton"
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    placeholder="Optional"
                    {...form.register("quantityPerCarton", { valueAsNumber: true })}
                  />
                  <FieldError errors={[form.formState.errors.quantityPerCarton]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.orderByDate} className="gap-1.5">
                <FieldLabel htmlFor="pf-order-by-date">Order By Date</FieldLabel>
                <FieldContent>
                  <Input id="pf-order-by-date" type="date" {...form.register("orderByDate")} />
                  <FieldError errors={[form.formState.errors.orderByDate]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.editingStatus} className="gap-1.5">
                <FieldLabel>Editing Status</FieldLabel>
                <FieldContent>
                  <Controller
                    control={form.control}
                    name="editingStatus"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                        items={
                          [
                            { value: "none", label: "Not set" },
                            ...productEditingStatusValues.map((value) => ({
                              value,
                              label: productEditingStatusLabels[value],
                            })),
                          ] as Array<{ value: string; label: string }>
                        }
                      >
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not set</SelectItem>
                          {productEditingStatusValues.map((value) => (
                            <SelectItem key={value} value={value}>
                              {productEditingStatusLabels[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.editingStatus]} />
                </FieldContent>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="pf-stock-count">Stock count</FieldLabel>
                <FieldContent>
                  <Input
                    id="pf-stock-count"
                    value={optionalNumberLabel(stockCount)}
                    placeholder="Not set"
                    disabled
                    readOnly
                  />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.imageLink} className="gap-1.5 md:col-span-2">
                <FieldLabel htmlFor="pf-image-link">Image Link</FieldLabel>
                <FieldContent>
                  <Input
                    id="pf-image-link"
                    placeholder="https://..."
                    {...form.register("imageLink")}
                  />
                  <FieldError errors={[form.formState.errors.imageLink]} />
                </FieldContent>
              </Field>
              <Field data-invalid={!!form.formState.errors.description} className="gap-1.5 md:col-span-2">
                <FieldLabel htmlFor="pf-description">Description</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="pf-description"
                    placeholder="Optional"
                    rows={4}
                    {...form.register("description")}
                  />
                  <FieldError errors={[form.formState.errors.description]} />
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldSet>
          <Field data-invalid={!!form.formState.errors.collectionId} className="gap-1.5">
            <FieldLabel>Collection</FieldLabel>
            <FieldContent>
              <Controller
                control={form.control}
                name="collectionId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? undefined}
                    onValueChange={field.onChange}
                    items={[
                      { value: "none", label: "No collection" },
                      ...productCollections.map((collection) => ({
                        value: collection.id,
                        label: collection.name,
                      })),
                    ]}
                  >
                    <SelectTrigger className="w-full min-w-0">
                      <SelectValue placeholder="Collection (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No collection</SelectItem>
                      {productCollections.map((collection) => (
                        <SelectItem key={collection.id} value={collection.id}>
                          {collection.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.collectionId]} />
            </FieldContent>
          </Field>
          <CustomFieldsRenderer
            ref={customFieldsRef}
            entityType="product"
            entityId={editingId}
            disabled={isSubmitting}
            nativeValues={nativeValues}
          />
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
