"use client";

import { useSession } from "next-auth/react";
import {
  STORE_PRICE_LABEL,
  STORE_PRICE_SHORT_LABEL,
  WHOLESALE_PRICE_LABEL,
  WHOLESALE_PRICE_SHORT_LABEL,
} from "@/lib/store-pricing";

/** Labels for the price a sale channel account pays, which differs for store magic-link accounts. */
export function useSaleChannelPricing() {
  const { data: session } = useSession();
  const isStorePricing = session?.user?.saleChannelType === "store";

  return {
    isStorePricing,
    priceLabel: isStorePricing ? STORE_PRICE_LABEL : WHOLESALE_PRICE_LABEL,
    priceShortLabel: isStorePricing ? STORE_PRICE_SHORT_LABEL : WHOLESALE_PRICE_SHORT_LABEL,
  };
}
