-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('internal', 'distributor');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "type" "UserType" NOT NULL DEFAULT 'internal';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "saleChannelId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "User_saleChannelId_key" ON "User"("saleChannelId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_saleChannelId_fkey" FOREIGN KEY ("saleChannelId") REFERENCES "SaleChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
