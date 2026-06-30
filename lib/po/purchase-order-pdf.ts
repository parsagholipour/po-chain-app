import "server-only";

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { Prisma } from "@/app/generated/prisma/client";
import { formatUsd } from "@/lib/format-usd";
import { prisma } from "@/lib/prisma";
import { getPresignedGetUrl, putObject } from "@/lib/storage";

const PDF_CONTENT_TYPE = "application/pdf";
const DEFAULT_EMAIL_LINK_EXPIRES_SECONDS = 7 * 24 * 60 * 60;
const MAX_PRESIGNED_URL_EXPIRES_SECONDS = 7 * 24 * 60 * 60;
const TEMPLATE_ASSET_DIR = path.join(process.cwd(), "public", "pdf-templates");
const TEMPLATE_ARCANE_LOGO = "arcane-fortress-logo.png";
const TEMPLATE_PHD_LOGO = "phd-logo.png";
const TEMPLATE_PURPLE = "#6f24e8";
const TEMPLATE_LIGHT_PURPLE = "#f2ecff";
const TEMPLATE_DARK = "#17182a";
const TEMPLATE_GRAY = "#667085";
const TEMPLATE_BORDER = "#dfe3e8";
const TEMPLATE_GREEN = "#009a67";
const TEMPLATE_BILLING_EMAIL =
  process.env.DISTRIBUTOR_PO_BILLING_EMAIL?.trim() || "general@arcane-fortress.com";

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

export async function createDistributorOrderReceivedPdfEmailLink({
  purchaseOrderId,
  storeId,
}: {
  purchaseOrderId: string;
  storeId: string;
}): Promise<PurchaseOrderPdfEmailLink> {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, storeId, type: "distributor" },
    include: purchaseOrderPdfInclude,
  });

  if (!purchaseOrder) {
    throw new Error("Purchase order was not found for distributor PDF generation.");
  }

  const buffer = await renderDistributorOrderReceivedPdf(purchaseOrder);
  const key = distributorOrderReceivedPdfObjectKey(purchaseOrder);
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

async function renderDistributorOrderReceivedPdf(
  purchaseOrder: PurchaseOrderPdfData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 0,
      bufferPages: false,
      info: {
        Title: `Purchase Order ${purchaseOrder.number}`,
        Author: purchaseOrder.store.name,
        Subject: distributorOrderNumber(purchaseOrder),
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    drawDistributorOrderReceivedTemplate(doc, purchaseOrder);
    doc.end();
  });
}

function drawDistributorOrderReceivedTemplate(
  doc: PDFKit.PDFDocument,
  po: PurchaseOrderPdfData,
) {
  drawDistributorTemplateHeader(doc, po);
  drawDistributorTemplateSummary(doc, po);
  drawDistributorTemplateContactBox(doc, po);

  const tableEndY = drawDistributorTemplateLineItems(doc, po, 342);
  const summaryY = ensureDistributorTemplatePageSpace(
    doc,
    Math.max(tableEndY + 40, 507),
    116,
    po,
  );
  drawDistributorTemplateFooterSummary(doc, po, summaryY);

  const footerY = ensureDistributorTemplatePageSpace(
    doc,
    Math.max(summaryY + 82, 588),
    42,
    po,
  );
  drawDistributorTemplateFooter(doc, po, footerY);
}

function drawDistributorTemplateHeader(doc: PDFKit.PDFDocument, po: PurchaseOrderPdfData) {
  const arcaneLogo = templateAssetBuffer(TEMPLATE_ARCANE_LOGO);
  if (arcaneLogo) {
    doc.image(arcaneLogo, 42, 56, { fit: [152, 42] });
  } else {
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(TEMPLATE_DARK)
      .text(po.store.name, 42, 67, { width: 165 });
  }

  const saleChannelName = po.saleChannel?.name?.trim() ?? "";
  const phdLogo = isPhdSaleChannel(saleChannelName) ? templateAssetBuffer(TEMPLATE_PHD_LOGO) : null;
  if (phdLogo) {
    doc.image(phdLogo, 458, 61, { fit: [112, 38] });
  } else if (saleChannelName) {
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(TEMPLATE_DARK)
      .text(saleChannelName, 430, 72, { width: 140, align: "right" });
  }

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(TEMPLATE_PURPLE)
    .text("PURCHASE ORDER", 236, 54, { width: 140, align: "center" });
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(TEMPLATE_DARK)
    .text(`PO #${po.number}`, 236, 73, { width: 140, align: "center" });

  doc
    .moveTo(48, 108)
    .lineTo(564, 108)
    .strokeColor(TEMPLATE_PURPLE)
    .lineWidth(2)
    .stroke();
}

function drawDistributorContinuationHeader(
  doc: PDFKit.PDFDocument,
  po: PurchaseOrderPdfData,
) {
  drawDistributorTemplateHeader(doc, po);
}

function drawDistributorTemplateSummary(doc: PDFKit.PDFDocument, po: PurchaseOrderPdfData) {
  const x = 72;
  const y = 121;
  const h = 48;
  const widths = [72, 79, 79, 166, 72];
  const cells = [
    ["STATUS", titleCase(po.status), po.status === "open" ? TEMPLATE_GREEN : TEMPLATE_DARK],
    ["ORDER TYPE", po.isBackOrder ? "Back Order" : "Standard Order", TEMPLATE_DARK],
    ["PO DATE", formatTemplateDate(po.createdAt), TEMPLATE_DARK],
    ["DISTRIBUTOR ORDER", distributorOrderNumber(po), TEMPLATE_DARK],
    ["PLACED BY", po.saleChannel?.name ?? "", TEMPLATE_DARK],
  ] as const;

  doc.roundedRect(x, y, 468, h, 6).fillColor(TEMPLATE_LIGHT_PURPLE).fill();

  let cellX = x;
  for (let index = 0; index < cells.length; index += 1) {
    if (index > 0) {
      doc
        .moveTo(cellX, y)
        .lineTo(cellX, y + h)
        .strokeColor("#ded6ef")
        .lineWidth(0.7)
        .stroke();
    }

    const [label, value, color] = cells[index];
    const pad = index === 0 ? 14 : 10;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(TEMPLATE_GRAY)
      .text(label, cellX + pad, y + 13, { width: widths[index] - pad - 6 });
    drawFittedText(doc, String(value), cellX + pad, y + 27, widths[index] - pad - 6, {
      font: "Helvetica-Bold",
      fontSize: 10,
      minFontSize: 7,
      color,
    });

    cellX += widths[index];
  }
}

function drawDistributorTemplateContactBox(
  doc: PDFKit.PDFDocument,
  po: PurchaseOrderPdfData,
) {
  const x = 43;
  const y = 185;
  const w = 526;
  const h = 137;
  const midX = x + w / 2;

  doc.rect(x, y, w, h).fillColor("#fbfcff").fill();
  doc.rect(x, y, w, h).strokeColor(TEMPLATE_BORDER).lineWidth(0.7).stroke();
  doc.moveTo(midX, y).lineTo(midX, y + h).strokeColor(TEMPLATE_BORDER).lineWidth(0.7).stroke();

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(TEMPLATE_GRAY)
    .text("SHIP TO", x + 14, y + 17, { width: 220 });

  let shipY = y + 32;
  const shipTo = distributorShipTo(po);
  if (shipTo.locationName) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(TEMPLATE_DARK)
      .text(shipTo.locationName, x + 14, shipY, { width: 240, lineGap: 1 });
    shipY = doc.y + 2;
  }
  for (const line of shipTo.addressLines) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(TEMPLATE_DARK)
      .text(line, x + 14, shipY, { width: 240, lineGap: 1 });
    shipY = doc.y + 1;
  }
  shipY += 4;
  for (const line of shipTo.contactLines) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(TEMPLATE_DARK)
      .text(line, x + 14, shipY, { width: 240, lineGap: 1 });
    shipY = doc.y + 1;
  }
  if (po.shipToNotes) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(TEMPLATE_GRAY)
      .text(po.shipToNotes, x + 14, Math.max(shipY + 6, y + 114), {
        width: 240,
        height: 16,
        ellipsis: true,
      });
  }

  const rightX = midX + 14;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(TEMPLATE_GRAY)
    .text("SUPPLIER CONTACT", rightX, y + 17, { width: 220 });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(TEMPLATE_DARK)
    .text(po.store.name, rightX, y + 32, { width: 220 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(TEMPLATE_DARK)
    .text(po.store.email ?? "", rightX, y + 46, { width: 220 });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(TEMPLATE_GRAY)
    .text("BILLING / AP", rightX, y + 65, { width: 220 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(TEMPLATE_DARK)
    .text(TEMPLATE_BILLING_EMAIL, rightX, y + 79, { width: 220 });

  const trackingNumbers = distributorTrackingNumbers(po);
  if (trackingNumbers.length > 0) {
    const label = trackingNumbers.length === 1 ? "TRACKING NUMBER" : "TRACKING NUMBERS";
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(TEMPLATE_GRAY)
      .text(label, rightX, y + 100, { width: 220 });
    drawFittedText(doc, trackingNumbers.join(", "), rightX, y + 114, 220, {
      font: "Helvetica-Bold",
      fontSize: 9,
      minFontSize: 7,
      color: TEMPLATE_DARK,
    });
  }
}

function drawDistributorTemplateLineItems(
  doc: PDFKit.PDFDocument,
  po: PurchaseOrderPdfData,
  startY: number,
) {
  const rows = distributorTemplateLineRows(po);
  const tableX = 56;
  const tableW = 500;
  let y = startY;

  drawDistributorLineTableHeader(doc, tableX, y, tableW);
  y += 29;

  for (const row of rows) {
    const rowHeight = distributorLineRowHeight(doc, row);
    if (y + rowHeight + 258 > 752) {
      doc.addPage();
      drawDistributorContinuationHeader(doc, po);
      y = 150;
      drawDistributorLineTableHeader(doc, tableX, y, tableW);
      y += 29;
    }
    drawDistributorLineRow(doc, row, tableX, y, tableW, rowHeight);
    y += rowHeight;
  }

  drawDistributorTotalsBox(doc, po, y);
  return y + 73;
}

function drawDistributorLineTableHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
) {
  doc.rect(x, y, width, 29).fillColor(TEMPLATE_PURPLE).fill();
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#ffffff")
    .text("SKU", x + 10, y + 12, { width: 70 })
    .text("PRODUCT", x + 89, y + 12, { width: 220 })
    .text("QTY", x + 310, y + 12, { width: 42, align: "right" })
    .text("UNIT PRICE", x + 361, y + 12, { width: 70, align: "right" })
    .text("TOTAL", x + 441, y + 12, { width: 50, align: "right" });
}

function drawDistributorLineRow(
  doc: PDFKit.PDFDocument,
  row: DistributorTemplateLineRow,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  doc.rect(x, y, width, height).fillColor("#ffffff").fill();
  doc.rect(x, y, width, height).strokeColor(TEMPLATE_BORDER).lineWidth(0.7).stroke();

  const contentY = y + 14;
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(TEMPLATE_PURPLE)
    .text(row.sku, x + 10, contentY + 4, { width: 70 });
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(TEMPLATE_DARK)
    .text(row.productName, x + 89, contentY, { width: 220, lineGap: 1 });
  if (row.productDetail) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(TEMPLATE_GRAY)
      .text(row.productDetail, x + 89, doc.y + 2, {
        width: 220,
        height: 11,
        ellipsis: true,
      });
  }
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(TEMPLATE_DARK)
    .text(String(row.quantity), x + 310, contentY + 5, { width: 42, align: "right" })
    .text(moneyOrDash(row.unitPrice), x + 361, contentY + 5, { width: 70, align: "right" })
    .text(moneyOrDash(row.total), x + 441, contentY + 5, { width: 50, align: "right" });
}

function drawDistributorTotalsBox(
  doc: PDFKit.PDFDocument,
  po: PurchaseOrderPdfData,
  y: number,
) {
  const x = 54;
  const w = 504;
  const subtotal = distributorSubtotal(po);

  doc.rect(x, y, w, 48).fillColor("#fbfcff").fill();
  doc.rect(x, y, w, 48).strokeColor(TEMPLATE_BORDER).lineWidth(0.7).stroke();
  doc.moveTo(x, y + 24).lineTo(x + w, y + 24).strokeColor(TEMPLATE_BORDER).lineWidth(0.7).stroke();
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(TEMPLATE_GRAY)
    .text("Subtotal", x + 376, y + 10, { width: 70, align: "right" })
    .text("Shipping", x + 376, y + 34, { width: 70, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(TEMPLATE_DARK)
    .text(formatUsd(subtotal), x + 454, y + 10, { width: 42, align: "right" })
    .fillColor(TEMPLATE_GRAY)
    .text("TBD", x + 454, y + 34, { width: 42, align: "right" });

  doc.rect(x, y + 48, w, 25).fillColor("#fbfcff").fill();
  doc.rect(x, y + 48, w, 25).strokeColor(TEMPLATE_BORDER).lineWidth(0.7).stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(TEMPLATE_DARK)
    .text("Order Total", x + 354, y + 58, { width: 96, align: "right" });
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(TEMPLATE_PURPLE)
    .text(formatUsd(subtotal), x + 454, y + 58, { width: 42, align: "right" });
}

function drawDistributorTemplateFooterSummary(
  doc: PDFKit.PDFDocument,
  po: PurchaseOrderPdfData,
  y: number,
) {
  const x = 54;
  const w = 504;
  const h = 56;
  const headerH = 27;
  const colW = w / 4;
  const quantity = distributorItemsOrdered(po);
  const values = [
    unitLabel(quantity),
    po.isBackOrder ? unitLabel(quantity) : unitLabel(0),
    "TBD",
    "Net 30",
  ];
  const labels = ["ITEMS ORDERED", "BACKORDER ITEMS", "ESTIMATED SHIP DATE", "PAYMENT TERMS"];

  doc.rect(x, y, w, h).fillColor("#ffffff").fill();
  doc.rect(x, y, w, h).strokeColor(TEMPLATE_BORDER).lineWidth(0.7).stroke();
  doc.moveTo(x, y + headerH).lineTo(x + w, y + headerH).strokeColor(TEMPLATE_BORDER).lineWidth(0.7).stroke();

  for (let index = 0; index < 4; index += 1) {
    const cellX = x + index * colW;
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(TEMPLATE_GRAY)
      .text(labels[index], cellX + 14, y + 10, { width: colW - 28 });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(TEMPLATE_DARK)
      .text(values[index], cellX + 14, y + 38, { width: colW - 28 });
  }
}

function drawDistributorTemplateFooter(
  doc: PDFKit.PDFDocument,
  po: PurchaseOrderPdfData,
  y: number,
) {
  const website = storeWebsiteLabel(po.store.website);
  const firstLine = website
    ? `This purchase order was generated by the ${po.store.name} Distributor Portal \u00b7 ${website}`
    : `This purchase order was generated by the ${po.store.name} Distributor Portal`;
  const secondLine = po.store.email ? `Questions? Contact us at ${po.store.email}` : "";

  doc
    .moveTo(49, y)
    .lineTo(563, y)
    .strokeColor(TEMPLATE_BORDER)
    .lineWidth(0.7)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(TEMPLATE_GRAY)
    .text(firstLine, 90, y + 11, { width: 432, align: "center" });
  if (secondLine) {
    doc.text(secondLine, 90, y + 22, { width: 432, align: "center" });
  }
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

type DistributorTemplateLineRow = {
  sku: string;
  productName: string;
  productDetail: string;
  quantity: number;
  unitPrice: number | null;
  total: number | null;
};

function distributorTemplateLineRows(po: PurchaseOrderPdfData): DistributorTemplateLineRow[] {
  return po.lines.map((line) => {
    const unitPrice = decimalToNumber(line.unitPrice);
    const quantity = line.orderedQuantity;
    const detailParts = [
      line.product.type?.name ?? line.product.category?.name ?? line.product.collection?.name,
      line.product.upcGtin ? `UPC ${line.product.upcGtin}` : null,
    ].filter((value): value is string => Boolean(value));

    return {
      sku: line.product.sku,
      productName: line.product.name,
      productDetail: detailParts.join(" \u00b7 "),
      quantity,
      unitPrice,
      total: unitPrice == null ? null : unitPrice * quantity,
    };
  });
}

function distributorLineRowHeight(
  doc: PDFKit.PDFDocument,
  row: DistributorTemplateLineRow,
) {
  doc.font("Helvetica-Bold").fontSize(9.5);
  const nameHeight = doc.heightOfString(row.productName, { width: 220, lineGap: 1 });
  const detailHeight = row.productDetail ? 13 : 0;
  return Math.max(44, Math.ceil(nameHeight + detailHeight + 22));
}

function distributorSubtotal(po: PurchaseOrderPdfData) {
  return po.lines.reduce((sum, line) => {
    const unitPrice = decimalToNumber(line.unitPrice);
    return unitPrice == null ? sum : sum + unitPrice * line.orderedQuantity;
  }, 0);
}

function distributorItemsOrdered(po: PurchaseOrderPdfData) {
  return po.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
}

function unitLabel(quantity: number) {
  return `${quantity} ${quantity === 1 ? "unit" : "units"}`;
}

function distributorOrderNumber(po: PurchaseOrderPdfData) {
  return po.invoice?.invoiceNumber ?? extractDistributorOrderNumber(po.name) ?? po.name;
}

function extractDistributorOrderNumber(value: string) {
  return /\bDO-\d{8}-[A-Z0-9]+\b/i.exec(value)?.[0].toUpperCase() ?? null;
}

function distributorShipTo(po: PurchaseOrderPdfData) {
  return {
    locationName: po.shipToLocationName,
    addressLines: [
      po.shipToAddressLine1,
      po.shipToAddressLine2,
      distributorCityStatePostal(po),
      po.shipToCountry,
    ].filter((line): line is string => Boolean(line)),
    contactLines: [po.shipToEmail, po.shipToPhoneNumber].filter(
      (line): line is string => Boolean(line),
    ),
  };
}

function distributorTrackingNumbers(po: PurchaseOrderPdfData) {
  const seen = new Set<string>();
  const trackingNumbers: string[] = [];

  for (const { shipping } of po.purchaseOrderShippings) {
    if (shipping.status === "cancelled") continue;

    const trackingNumber = shipping.trackingNumber.trim();
    if (!trackingNumber) continue;

    const key = trackingNumber.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    trackingNumbers.push(trackingNumber);
  }

  return trackingNumbers;
}

function distributorCityStatePostal(po: PurchaseOrderPdfData) {
  const cityState = [po.shipToCity, po.shipToStateProvince].filter(Boolean).join(", ");
  return [cityState, po.shipToPostalCode].filter(Boolean).join(" ");
}

function formatTemplateDate(value: Date) {
  return value.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function storeWebsiteLabel(value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  }
}

function isPhdSaleChannel(value: string) {
  return value.trim().toLowerCase() === "phd";
}

const templateAssetCache = new Map<string, Buffer | null>();

function templateAssetBuffer(filename: string) {
  const cached = templateAssetCache.get(filename);
  if (cached !== undefined) return cached;

  try {
    const buffer = fs.readFileSync(path.join(TEMPLATE_ASSET_DIR, filename));
    templateAssetCache.set(filename, buffer);
    return buffer;
  } catch {
    templateAssetCache.set(filename, null);
    return null;
  }
}

function ensureDistributorTemplatePageSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  height: number,
  po: PurchaseOrderPdfData,
) {
  if (y + height <= 752) return y;
  doc.addPage();
  drawDistributorContinuationHeader(doc, po);
  return 150;
}

function drawFittedText(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  options: {
    font: string;
    fontSize: number;
    minFontSize: number;
    color: string;
  },
) {
  let fontSize = options.fontSize;
  doc.font(options.font).fontSize(fontSize);
  while (fontSize > options.minFontSize && doc.widthOfString(text) > width) {
    fontSize -= 0.5;
    doc.fontSize(fontSize);
  }

  doc
    .font(options.font)
    .fontSize(fontSize)
    .fillColor(options.color)
    .text(truncateTextToWidth(doc, text, width), x, y, {
      width,
      lineBreak: false,
    });
}

function truncateTextToWidth(doc: PDFKit.PDFDocument, text: string, width: number) {
  if (doc.widthOfString(text) <= width) return text;
  const ellipsis = "...";
  let next = text;
  while (next.length > 0 && doc.widthOfString(`${next}${ellipsis}`) > width) {
    next = next.slice(0, -1);
  }
  return next ? `${next}${ellipsis}` : ellipsis;
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

function distributorOrderReceivedPdfObjectKey(
  po: Pick<PurchaseOrderPdfData, "storeId" | "id" | "number">,
) {
  return `generated/distributor-order-received/${po.storeId}/${po.id}/po-${po.number}.pdf`;
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
