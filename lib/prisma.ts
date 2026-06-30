import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/app/generated/prisma/client";

const REQUIRED_GENERATED_MODELS = [
  "CjDropshippingIntegration",
  "CjDropshippingInventoryCount",
  "CjDropshippingInventoryTransaction",
] as const;

const REQUIRED_CLIENT_DELEGATES = [
  "cjDropshippingIntegration",
  "cjDropshippingInventoryCount",
  "cjDropshippingInventoryTransaction",
] as const;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaModelSignature: string | undefined;
};

type PrismaClientWithDynamicDelegates = PrismaClient &
  Record<
    (typeof REQUIRED_CLIENT_DELEGATES)[number],
    { findUnique?: unknown; findMany?: unknown } | undefined
  >;

function generatedModelSignature() {
  const modelName = (Prisma as unknown as { ModelName?: Record<string, string> })
    .ModelName;
  return Object.keys(modelName ?? {}).sort().join("|");
}

function missingGeneratedModels() {
  const modelName = (Prisma as unknown as { ModelName?: Record<string, string> })
    .ModelName;
  return REQUIRED_GENERATED_MODELS.filter((model) => modelName?.[model] !== model);
}

function missingClientDelegates(client: PrismaClient) {
  const dynamicClient = client as PrismaClientWithDynamicDelegates;
  return REQUIRED_CLIENT_DELEGATES.filter((delegate) => {
    const modelDelegate = dynamicClient[delegate];
    return (
      typeof modelDelegate?.findUnique !== "function" &&
      typeof modelDelegate?.findMany !== "function"
    );
  });
}

function assertGeneratedClientIsCurrent() {
  const missingModels = missingGeneratedModels();
  if (missingModels.length === 0) return;

  throw new Error(
    `Prisma client is out of date. Missing generated model(s): ${missingModels.join(
      ", ",
    )}. Run "npm run db:generate" and restart the app process.`,
  );
}

function createPrismaClient() {
  assertGeneratedClientIsCurrent();

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg(url);
  const client = new PrismaClient({ adapter });

  const missingDelegates = missingClientDelegates(client);
  if (missingDelegates.length > 0) {
    throw new Error(
      `Prisma client is out of date. Missing generated delegate(s): ${missingDelegates.join(
        ", ",
      )}. Run "npm run db:generate" and restart the app process.`,
    );
  }

  return client;
}

const currentModelSignature = generatedModelSignature();
const cachedPrisma = globalForPrisma.prisma;
const cachedPrismaIsCurrent =
  cachedPrisma != null &&
  globalForPrisma.prismaModelSignature === currentModelSignature &&
  missingClientDelegates(cachedPrisma).length === 0;

if (
  process.env.NODE_ENV !== "production" &&
  cachedPrisma &&
  !cachedPrismaIsCurrent
) {
  void cachedPrisma.$disconnect().catch((error) => {
    console.warn("[prisma] could not disconnect stale Prisma client", error);
  });
}

export const prisma = cachedPrismaIsCurrent ? cachedPrisma : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaModelSignature = currentModelSignature;
}
