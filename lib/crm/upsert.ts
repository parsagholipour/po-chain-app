import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isStaleLeadDelete,
  isStaleLeadUpdate,
  mapCrmLead,
  mapDeletedLead,
  sampleProductLineIds,
  type CrmSyncTrigger,
  type MappedLead,
} from "@/lib/crm/lead";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function nullableJson(value: Record<string, unknown> | null) {
  return value ? jsonValue(value) : Prisma.DbNull;
}

function leadScalarData(mapped: MappedLead) {
  return {
    organizationId: mapped.organizationId,
    status: mapped.status,
    salutation: mapped.salutation,
    firstName: mapped.firstName,
    lastName: mapped.lastName,
    company: mapped.company,
    title: mapped.title,
    website: mapped.website,
    description: mapped.description,
    ownerId: mapped.ownerId,
    owner: jsonValue(mapped.owner),
    rating: mapped.rating,
    phone: mapped.phone,
    email: mapped.email,
    country: mapped.country,
    street: mapped.street,
    postalCode: mapped.postalCode,
    city: mapped.city,
    state: mapped.state,
    numberOfEmployees: mapped.numberOfEmployees,
    annualRevenue: mapped.annualRevenue,
    leadSource: mapped.leadSource,
    industry: mapped.industry,
    sampleRequestedDate: mapped.sampleRequestedDate,
    sampleStatus: mapped.sampleStatus,
    courier: mapped.courier,
    trackingNumber: mapped.trackingNumber,
    deliveryDate: mapped.deliveryDate,
    convertedAt: mapped.convertedAt,
    convertedAccountId: mapped.convertedAccountId,
    convertedContactId: mapped.convertedContactId,
    convertedOpportunityId: mapped.convertedOpportunityId,
    createdById: mapped.createdById,
    updatedById: mapped.updatedById,
    crmCreatedAt: mapped.crmCreatedAt,
    crmUpdatedAt: mapped.crmUpdatedAt,
    shipment: nullableJson(mapped.shipment),
    payload: jsonValue(mapped.payload),
    deletedAt: null,
  };
}

async function replaceSampleProducts(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    leadId: string;
    lines: MappedLead["sampleProducts"];
  },
) {
  const keepIds = sampleProductLineIds(input.lines);
  if (keepIds.length === 0) {
    await tx.crmLeadSampleProduct.deleteMany({ where: { leadId: input.leadId } });
    return;
  }

  await tx.crmLeadSampleProduct.deleteMany({
    where: { leadId: input.leadId, crmLineId: { notIn: keepIds } },
  });

  for (const line of input.lines) {
    await tx.crmLeadSampleProduct.upsert({
      where: {
        leadId_crmLineId: { leadId: input.leadId, crmLineId: line.crmLineId },
      },
      create: {
        storeId: input.storeId,
        leadId: input.leadId,
        crmLineId: line.crmLineId,
        crmProductId: line.crmProductId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
        description: line.description,
        displayOrder: line.displayOrder,
        product: nullableJson(line.product),
      },
      update: {
        crmProductId: line.crmProductId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
        description: line.description,
        displayOrder: line.displayOrder,
        product: nullableJson(line.product),
      },
    });
  }
}

export async function upsertCrmLead(input: {
  storeId: string;
  integrationId: string;
  lead: unknown;
  trigger: CrmSyncTrigger;
  syncRunId?: string;
  now?: Date;
}) {
  const mapped = mapCrmLead(input.lead);
  const now = input.now ?? new Date();

  const existing = await prisma.crmLead.findUnique({
    where: {
      storeId_crmLeadId: { storeId: input.storeId, crmLeadId: mapped.crmLeadId },
    },
    select: { id: true, crmUpdatedAt: true },
  });

  if (existing && isStaleLeadUpdate(existing.crmUpdatedAt, mapped.crmUpdatedAt)) {
    if (input.syncRunId) {
      await prisma.crmLead.update({
        where: { id: existing.id },
        data: { lastSeenInRunId: input.syncRunId },
      });
    }
    return { id: existing.id, skipped: true as const };
  }

  const scalars = leadScalarData(mapped);

  return prisma.$transaction(async (tx) => {
    const row = existing
      ? await tx.crmLead.update({
          where: { id: existing.id },
          data: {
            ...scalars,
            lastSyncedAt: now,
            lastSyncTrigger: input.trigger,
            lastSeenInRunId: input.syncRunId ?? undefined,
          },
        })
      : await tx.crmLead.create({
          data: {
            storeId: input.storeId,
            integrationId: input.integrationId,
            crmLeadId: mapped.crmLeadId,
            ...scalars,
            lastSyncedAt: now,
            lastSyncTrigger: input.trigger,
            lastSeenInRunId: input.syncRunId ?? null,
          },
        });

    await replaceSampleProducts(tx, {
      storeId: input.storeId,
      leadId: row.id,
      lines: mapped.sampleProducts,
    });

    return { id: row.id, skipped: false as const };
  });
}

export async function softDeleteCrmLead(input: {
  storeId: string;
  data: unknown;
  trigger: CrmSyncTrigger;
  now?: Date;
}) {
  const mapped = mapDeletedLead(input.data);
  const now = input.now ?? new Date();
  const existing = await prisma.crmLead.findUnique({
    where: {
      storeId_crmLeadId: { storeId: input.storeId, crmLeadId: mapped.crmLeadId },
    },
    select: { id: true, crmUpdatedAt: true, deletedAt: true },
  });

  if (!existing) return { skipped: true as const, reason: "missing" as const };
  if (existing.deletedAt) return { skipped: true as const, reason: "already_deleted" as const };
  if (isStaleLeadDelete(existing.crmUpdatedAt, mapped.deletedAt)) {
    return { skipped: true as const, reason: "stale" as const };
  }

  await prisma.crmLead.update({
    where: { id: existing.id },
    data: {
      deletedAt: mapped.deletedAt,
      lastSyncedAt: now,
      lastSyncTrigger: input.trigger,
    },
  });
  return { skipped: false as const, reason: null };
}

export async function markUnseenCrmLeadsDeleted(input: {
  storeId: string;
  syncRunId: string;
  trigger: CrmSyncTrigger;
  deletedAt: Date;
}) {
  const result = await prisma.crmLead.updateMany({
    where: {
      storeId: input.storeId,
      deletedAt: null,
      OR: [{ lastSeenInRunId: null }, { lastSeenInRunId: { not: input.syncRunId } }],
    },
    data: {
      deletedAt: input.deletedAt,
      lastSyncedAt: input.deletedAt,
      lastSyncTrigger: input.trigger,
    },
  });
  return result.count;
}

export async function findCrmWebhookDelivery(input: {
  integrationId: string;
  deliveryId: string;
}) {
  return prisma.crmWebhookDelivery.findUnique({
    where: {
      integrationId_deliveryId: {
        integrationId: input.integrationId,
        deliveryId: input.deliveryId,
      },
    },
    select: { id: true },
  });
}

export async function recordCrmWebhookDelivery(input: {
  storeId: string;
  integrationId: string;
  deliveryId: string;
  event: string;
}) {
  try {
    await prisma.crmWebhookDelivery.create({
      data: {
        storeId: input.storeId,
        integrationId: input.integrationId,
        deliveryId: input.deliveryId,
        event: input.event,
      },
    });
    return { duplicate: false as const };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { duplicate: true as const };
    }
    throw error;
  }
}
