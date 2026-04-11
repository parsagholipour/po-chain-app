type ProductAssetMissingField = "barcode" | "packaging";

export type ProductAssetValidationLine = {
  product: {
    name: string;
    sku: string;
    barcodeKey: string | null;
    packagingKey: string | null;
  };
  purchaseOrder?: {
    number: number;
    name: string;
    type: "distributor" | "stock";
  } | null;
};

export type MissingProductAssetLine<T extends ProductAssetValidationLine> = T & {
  missingFields: ProductAssetMissingField[];
};

function orderLabel(line: ProductAssetValidationLine) {
  const order = line.purchaseOrder;
  if (!order) return null;
  return `${order.type === "stock" ? "SO" : "PO"} #${order.number}`;
}

function productLabel(line: ProductAssetValidationLine) {
  return `${line.product.sku} - ${line.product.name}`;
}

export function findLinesMissingProductAssets<T extends ProductAssetValidationLine>(
  lines: T[],
): MissingProductAssetLine<T>[] {
  return lines.flatMap((line) => {
    const missingFields: ProductAssetMissingField[] = [];
    if (!line.product.barcodeKey) missingFields.push("barcode");
    if (!line.product.packagingKey) missingFields.push("packaging");
    return missingFields.length > 0 ? [{ ...line, missingFields }] : [];
  });
}

export function formatMissingProductAssetsError<T extends ProductAssetValidationLine>(
  missingLines: MissingProductAssetLine<T>[],
  actionLabel: string,
) {
  const preview = missingLines.slice(0, 5).map((line) => {
    const order = orderLabel(line);
    const product = productLabel(line);
    const missing = line.missingFields.join(" and ");
    return `${order ? `${order} / ` : ""}${product} (${missing})`;
  });
  const extra = missingLines.length > preview.length ? `; +${missingLines.length - preview.length} more` : "";
  return `${actionLabel} because order line products must include barcode and packaging. Missing: ${preview.join("; ")}${extra}.`;
}
