-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SaleChannelType" AS ENUM ('distributor', 'amazon', 'cjdropshipping');

-- CreateEnum
CREATE TYPE "PurchaseOrderType" AS ENUM ('distributor', 'stock');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('open', 'in_transit', 'closed');

-- CreateEnum
CREATE TYPE "ManufacturingOrderStatus" AS ENUM ('open', 'ready_to_ship', 'shipped', 'invoiced', 'paid', 'closed');

-- CreateEnum
CREATE TYPE "ManufacturingOrderManufacturerStatus" AS ENUM ('initial', 'deposit_paid', 'manufacturing', 'balance_paid', 'ready_to_pickup', 'picked_up');

-- CreateEnum
CREATE TYPE "ShippingType" AS ENUM ('manufacturing_order', 'purchase_order', 'stock_order');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('pending', 'in_transit', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "LogisticsPartnerType" AS ENUM ('freight_forwarder', 'carrier');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('text', 'number', 'date', 'boolean', 'file', 'image');

-- CreateEnum
CREATE TYPE "ConditionLogic" AS ENUM ('and', 'or');

-- CreateEnum
CREATE TYPE "ConditionOperator" AS ENUM ('equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'contains', 'not_empty', 'is_empty');

-- CreateEnum
CREATE TYPE "PurchaseOrderOsdType" AS ENUM ('overage', 'shortage', 'damage');

-- CreateEnum
CREATE TYPE "PurchaseOrderOsdResolution" AS ENUM ('charged', 'returned', 'sent');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "keycloakSub" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_keycloakSub_key" ON "User"("keycloakSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
