export const shippingDestinationFieldNames = [
  "shipToLocationName",
  "shipToRecipientName",
  "shipToCompanyName",
  "shipToPhoneNumber",
  "shipToEmail",
  "shipToAddressLine1",
  "shipToAddressLine2",
  "shipToCity",
  "shipToStateProvince",
  "shipToPostalCode",
  "shipToCountry",
  "shipToNotes",
] as const;

export type ShippingDestinationFieldName =
  (typeof shippingDestinationFieldNames)[number];

export type ShippingDestinationInput = Partial<
  Record<ShippingDestinationFieldName, string | null>
> & {
  saleChannelLocationId?: string | null;
};

export type ShippingDestinationLocation = {
  id: string;
  name: string;
  recipientName: string;
  companyName: string | null;
  phoneNumber: string | null;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string | null;
  country: string;
  shippingNotes: string | null;
  saleChannelId: string;
};

export function hasShippingDestinationSnapshotValue(
  data: ShippingDestinationInput,
) {
  return shippingDestinationFieldNames.some((field) => {
    const value = data[field];
    return typeof value === "string" ? value.trim().length > 0 : value != null;
  });
}

export function shippingDestinationFromLocation(
  location: ShippingDestinationLocation,
) {
  return {
    saleChannelLocationId: location.id,
    shipToLocationName: location.name,
    shipToRecipientName: location.recipientName,
    shipToCompanyName: location.companyName,
    shipToPhoneNumber: location.phoneNumber,
    shipToEmail: location.email,
    shipToAddressLine1: location.addressLine1,
    shipToAddressLine2: location.addressLine2,
    shipToCity: location.city,
    shipToStateProvince: location.stateProvince,
    shipToPostalCode: location.postalCode,
    shipToCountry: location.country,
    shipToNotes: location.shippingNotes,
  };
}
