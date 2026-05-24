import "server-only";

import PDFDocument from "pdfkit";
import type { Prisma } from "@/app/generated/prisma/client";
import { formatUsd } from "@/lib/format-usd";
import { prisma } from "@/lib/prisma";
import { getPresignedGetUrl, putObject } from "@/lib/storage";

const PDF_CONTENT_TYPE = "application/pdf";
const DEFAULT_EMAIL_LINK_EXPIRES_SECONDS = 7 * 24 * 60 * 60;
const MAX_PRESIGNED_URL_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

const purchaseOrderPdfInclude = {
  store: { select: { name: true, email: true, website: true } },
  invoice: { select: { invoiceNumber: true, paymentStatus: true, totalAmount: true, currency: true } },
  saleChannel: {
    select: {
      name: true,
      type: true,
      email: true,
      contactNumber: true,
      address: true,
      link: true,
    },
  },
  saleChannelLocation: true,
  createdBy: { select: { name: true, email: true, realName: true, realEmail: true } },
  actualizedPo: { select: { number: true, name: true } },
  lines: {
    include: {
      product: {
        include: {
          defaultManufacturer: { select: { name: true } },
          category: { select: { name: true } },
          type: { select: { name: true } },
          collection: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  purchaseOrderShippings: {
    include: {
      shipping: {
        select: {
          trackingNumber: true,
          status: true,
          shippedAt: true,
          logisticsPartner: { select: { name: true } },
        },
      },
    },
  },
  osds: {
    select: {
      type: true,
      resolution: true,
      notes: true,
      lines: { select: { quantity: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
} as const;

type PurchaseOrderPdfData = Prisma.PurchaseOrderGetPayload<{
  include: typeof purchaseOrderPdfInclude;
}>;

export type PurchaseOrderPdfEmailLink = {
  filename: string;
  key: string;
  url: string;
  expiresInSeconds: number;
};

type TableColumn = {
  label: string;
  width: number;
  align?: "left" | "right" | "center";
};

type TableCell = {
  text: string;
  bold?: boolean;
  color?: string;
};

type TableRow = Array<string | TableCell>;

export async function createPurchaseOrderPdfEmailLink({
  purchaseOrderId,
  storeId,
}: {
  purchaseOrderId: string;
  storeId: string;
}): Promise<PurchaseOrderPdfEmailLink> {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, storeId },
    include: purchaseOrderPdfInclude,
  });

  if (!purchaseOrder) {
    throw new Error("Purchase order was not found for PDF generation.");
  }

  const buffer = await renderPurchaseOrderPdf(purchaseOrder);
  const key = purchaseOrderPdfObjectKey(purchaseOrder);
  await putObject({
    key,
    body: buffer,
    contentType: PDF_CONTENT_TYPE,
    cacheControl: "private, max-age=0, no-store",
  });

  const expiresInSeconds = emailPdfLinkExpiresSeconds();
  return {
    filename: purchaseOrderPdfFilename(purchaseOrder),
    key,
    url: await getPresignedGetUrl(key, expiresInSeconds),
    expiresInSeconds,
  };
}

async function renderPurchaseOrderPdf(purchaseOrder: PurchaseOrderPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      bufferPages: true,
      info: {
        Title: `Purchase Order ${purchaseOrder.number}`,
        Author: purchaseOrder.store.name,
        Subject: purchaseOrder.name,
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawPurchaseOrder(doc, purchaseOrder);
    addPageNumbers(doc);
    doc.end();
  });
}

function drawPurchaseOrder(doc: PDFKit.PDFDocument, po: PurchaseOrderPdfData) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  doc
    .fillColor("#111827")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("Purchase Order", { continued: false });

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#4b5563")
    .text(po.store.name, doc.page.margins.left, 43, { align: "right", width: pageWidth });

  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor("#111827")
    .text(`PO #${po.number}`, doc.page.margins.left, 75);
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#4b5563")
    .text(po.name);

  doc.moveDown(1.2);
  drawSection(doc, "Order Summary");
  drawKeyValueGrid(doc, [
    ["Status", titleCase(po.status)],
    ["Type", po.isBackOrder ? "Back order" : titleCase(po.type)],
    ["Created", formatDateTime(po.createdAt)],
    ["Updated", formatDateTime(po.updatedAt)],
    ["Created by", personLabel(po.createdBy)],
    ["Document key", po.documentKey ?? "None"],
    ["Invoice", po.invoice ? po.invoice.invoiceNumber : "None"],
    ["Actualized as", po.actualizedPo ? `PO #${po.actualizedPo.number} - ${po.actualizedPo.name}` : "No"],
  ]);

  drawSection(doc, "Store");
  drawKeyValueGrid(doc, [
    ["Name", po.store.name],
    ["Email", po.store.email ?? "None"],
    ["Website", po.store.website ?? "None"],
  ]);

  if (po.saleChannel) {
    drawSection(doc, "Sale Channel");
    drawKeyValueGrid(doc, [
      ["Name", po.saleChannel.name],
      ["Type", titleCase(po.saleChannel.type)],
      ["Email", po.saleChannel.email ?? "None"],
      ["Phone", po.saleChannel.contactNumber ?? "None"],
      ["Address", po.saleChannel.address ?? "None"],
      ["Link", po.saleChannel.link ?? "None"],
    ]);
  }

  const shipTo = shippingAddressLines(po);
  if (shipTo.length > 0) {
    drawSection(doc, "Ship To");
    drawParagraph(doc, shipTo.join("\n"));
  }

  if (po.shipToNotes) {
    drawSection(doc, "Shipping Notes");
    drawParagraph(doc, po.shipToNotes);
  }

  drawSection(doc, "Line Items");
  drawLineItemsTable(doc, po);

  const shippings = po.purchaseOrderShippings.map((item) => item.shipping);
  if (shippings.length > 0) {
    drawSection(doc, "Shipments");
    drawTable(
      doc,
      [
        { label: "Tracking", width: 150 },
        { label: "Status", width: 90 },
        { label: "Partner", width: 150 },
        { label: "Shipped", width: 110 },
      ],
      shippings.map((shipping) => [
        shipping.trackingNumber,
        titleCase(shipping.status),
        shipping.logisticsPartner?.name ?? "None",
        shipping.shippedAt ? formatDate(shipping.shippedAt) : "Not shipped",
      ]),
    );
  }

  if (po.osds.length > 0) {
    drawSection(doc, "OS&D");
    drawTable(
      doc,
      [
        { label: "Type", width: 95 },
        { label: "Resolution", width: 105 },
        { label: "Qty", width: 60, align: "right" },
        { label: "Created", width: 95 },
        { label: "Notes", width: 145 },
      ],
      po.osds.map((osd) => [
        titleCase(osd.type),
        titleCase(osd.resolution),
        String(osd.lines.reduce((sum, line) => sum + line.quantity, 0)),
        formatDate(osd.createdAt),
        osd.notes ?? "",
      ]),
    );
  }
}

function drawLineItemsTable(doc: PDFKit.PDFDocument, po: PurchaseOrderPdfData) {
  const columns: TableColumn[] = [
    { label: "SKU", width: 72 },
    { label: "Product", width: 180 },
    { label: "Mfr", width: 82 },
    { label: "Qty", width: 40, align: "right" },
    { label: "Price", width: 62, align: "right" },
    { label: "Total", width: 72, align: "right" },
  ];

  const rows: TableRow[] = po.lines.map((line) => {
    const price = decimalToNumber(line.unitPrice);
    const total = price == null ? null : price * line.quantity;
    const productDetails = [
      line.product.category?.name,
      line.product.type?.name,
      line.product.collection?.name,
      line.product.upcGtin ? `UPC ${line.product.upcGtin}` : null,
    ].filter((value): value is string => Boolean(value));

    return [
      line.product.sku,
      {
        text: productDetails.length
          ? `${line.product.name}\n${productDetails.join(" / ")}`
          : line.product.name,
      },
      line.product.defaultManufacturer.name,
      String(line.quantity),
      moneyOrDash(price),
      moneyOrDash(total),
    ];
  });

  drawTable(doc, columns, rows);

  const totals = po.lines.reduce(
    (acc, line) => {
      const cost = decimalToNumber(line.unitCost);
      const price = decimalToNumber(line.unitPrice);
      acc.orderedQuantity += line.orderedQuantity;
      acc.effectiveQuantity += line.quantity;
      if (cost != null) acc.cost += cost * line.quantity;
      if (price != null) acc.revenue += price * line.quantity;
      return acc;
    },
    { orderedQuantity: 0, effectiveQuantity: 0, cost: 0, revenue: 0 },
  );

  doc.moveDown(0.6);
  drawKeyValueGrid(doc, [
    ["Ordered quantity", String(totals.orderedQuantity)],
    ["Effective quantity", String(totals.effectiveQuantity)],
    ["Estimated cost", formatUsd(totals.cost)],
    ["Estimated revenue", formatUsd(totals.revenue)],
  ]);
}

function drawSection(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 42);
  doc.moveDown(0.8);
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text(title);
  doc.moveTo(doc.page.margins.left, doc.y + 4)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y + 4)
    .strokeColor("#d1d5db")
    .lineWidth(0.7)
    .stroke();
  doc.moveDown(0.8);
}

function drawParagraph(doc: PDFKit.PDFDocument, value: string) {
  ensureSpace(doc, doc.heightOfString(value, { width: contentWidth(doc) }) + 12);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#374151")
    .text(value, { width: contentWidth(doc), lineGap: 2 });
}

function drawKeyValueGrid(doc: PDFKit.PDFDocument, rows: Array<[string, string]>) {
  const gap = 16;
  const columnWidth = (contentWidth(doc) - gap) / 2;
  const labelWidth = 92;

  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i];
    const right = rows[i + 1];
    const rowHeight = Math.max(
      keyValueHeight(doc, left, columnWidth, labelWidth),
      right ? keyValueHeight(doc, right, columnWidth, labelWidth) : 0,
      18,
    );
    ensureSpace(doc, rowHeight + 4);
    const y = doc.y;
    drawKeyValue(doc, left, doc.page.margins.left, y, columnWidth, labelWidth);
    if (right) {
      drawKeyValue(doc, right, doc.page.margins.left + columnWidth + gap, y, columnWidth, labelWidth);
    }
    doc.y = y + rowHeight + 4;
  }
}

function drawKeyValue(
  doc: PDFKit.PDFDocument,
  [label, value]: [string, string],
  x: number,
  y: number,
  width: number,
  labelWidth: number,
) {
  const valueX = x + labelWidth;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#6b7280")
    .text(label.toUpperCase(), x, y, { width: labelWidth - 8 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#111827")
    .text(value, valueX, y, { width: width - labelWidth, lineGap: 1 });
}

function keyValueHeight(
  doc: PDFKit.PDFDocument,
  row: [string, string],
  width: number,
  labelWidth: number,
) {
  return doc.heightOfString(row[1], {
    width: width - labelWidth,
    lineGap: 1,
  });
}

function drawTable(doc: PDFKit.PDFDocument, columns: TableColumn[], rows: TableRow[]) {
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const startX = doc.page.margins.left;
  const padding = 5;

  ensureSpace(doc, 34);
  drawTableHeader(doc, columns, startX, tableWidth, padding);

  for (const row of rows) {
    const height = Math.max(
      ...row.map((cell, index) =>
        doc.heightOfString(cellText(cell), {
          width: columns[index].width - padding * 2,
          lineGap: 1,
        }),
      ),
      12,
    ) + padding * 2;

    ensureSpace(doc, height + 20);
    if (doc.y < 70) {
      drawTableHeader(doc, columns, startX, tableWidth, padding);
    }

    const y = doc.y;
    doc
      .rect(startX, y, tableWidth, height)
      .fillColor("#ffffff")
      .fill()
      .strokeColor("#e5e7eb")
      .lineWidth(0.5)
      .stroke();

    let x = startX;
    row.forEach((cell, index) => {
      const normalized = typeof cell === "string" ? { text: cell } : cell;
      doc
        .font(normalized.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8)
        .fillColor(normalized.color ?? "#111827")
        .text(normalized.text, x + padding, y + padding, {
          width: columns[index].width - padding * 2,
          align: columns[index].align ?? "left",
          lineGap: 1,
        });
      x += columns[index].width;
    });

    doc.y = y + height;
  }
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: TableColumn[],
  startX: number,
  tableWidth: number,
  padding: number,
) {
  const y = doc.y;
  doc
    .rect(startX, y, tableWidth, 22)
    .fillColor("#f3f4f6")
    .fill()
    .strokeColor("#d1d5db")
    .lineWidth(0.5)
    .stroke();

  let x = startX;
  for (const column of columns) {
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor("#374151")
      .text(column.label, x + padding, y + 7, {
        width: column.width - padding * 2,
        align: column.align ?? "left",
      });
    x += column.width;
  }
  doc.y = y + 22;
}

function ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight <= bottom) return;
  doc.addPage();
}

function addPageNumbers(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#6b7280")
      .text(`Page ${index + 1} of ${range.count}`, doc.page.margins.left, doc.page.height - 28, {
        align: "right",
        width: contentWidth(doc),
      });
  }
}

function contentWidth(doc: PDFKit.PDFDocument) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function cellText(cell: string | TableCell) {
  return typeof cell === "string" ? cell : cell.text;
}

function shippingAddressLines(po: PurchaseOrderPdfData) {
  return [
    po.shipToLocationName,
    po.shipToRecipientName,
    po.shipToCompanyName,
    po.shipToAddressLine1,
    po.shipToAddressLine2,
    [po.shipToCity, po.shipToStateProvince, po.shipToPostalCode]
      .filter(Boolean)
      .join(", "),
    po.shipToCountry,
    po.shipToPhoneNumber ? `Phone: ${po.shipToPhoneNumber}` : null,
    po.shipToEmail ? `Email: ${po.shipToEmail}` : null,
  ].filter((line): line is string => Boolean(line));
}

function personLabel(person: PurchaseOrderPdfData["createdBy"]) {
  return person.realName ?? person.name ?? person.realEmail ?? person.email;
}

function decimalToNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function moneyOrDash(value: number | null) {
  return value == null ? "-" : formatUsd(value);
}

function formatDate(value: Date) {
  return value.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: Date) {
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function purchaseOrderPdfObjectKey(po: Pick<PurchaseOrderPdfData, "storeId" | "id" | "number">) {
  return `generated/purchase-orders/${po.storeId}/${po.id}/po-${po.number}.pdf`;
}

function purchaseOrderPdfFilename(po: Pick<PurchaseOrderPdfData, "number">) {
  return `PO-${po.number}.pdf`;
}

function emailPdfLinkExpiresSeconds() {
  const raw = process.env.PO_EMAIL_PDF_URL_EXPIRES_SECONDS;
  if (!raw) return DEFAULT_EMAIL_LINK_EXPIRES_SECONDS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_EMAIL_LINK_EXPIRES_SECONDS;
  return Math.min(parsed, MAX_PRESIGNED_URL_EXPIRES_SECONDS);
}
