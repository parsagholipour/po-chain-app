import type { ProductFormValues } from "./product-form";

type ProductFileFieldOptions = {
  includeImageKey?: boolean;
  includeBarcodeKey?: boolean;
  includePackagingKey?: boolean;
};

export function productFormValuesToApiBody(
  values: ProductFormValues,
  {
    includeImageKey = true,
    includeBarcodeKey = true,
    includePackagingKey = true,
  }: ProductFileFieldOptions = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: values.name,
    sku: values.sku,
    upcGtin: values.upcGtin ?? null,
    cost: values.cost ?? null,
    price: values.price ?? null,
    mop: values.mop ?? null,
    map: values.map ?? null,
    msrp: values.msrp ?? null,
    quantityPerCarton: values.quantityPerCarton ?? null,
    orderByDate: values.orderByDate || null,
    editingStatus: values.editingStatus ?? "standard",
    description: values.description ?? null,
    imageLink: values.imageLink.trim(),
    defaultManufacturerId: values.defaultManufacturerId,
    categoryId: values.categoryId,
    typeId: values.typeId,
    collectionId: values.collectionId,
    verified: values.verified,
  };

  if (includeImageKey) body.imageKey = values.imageKey;
  if (includeBarcodeKey) body.barcodeKey = values.barcodeKey;
  if (includePackagingKey) body.packagingKey = values.packagingKey;

  return body;
}
