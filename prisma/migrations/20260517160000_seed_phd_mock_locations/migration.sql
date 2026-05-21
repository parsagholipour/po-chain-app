-- Mock PHD distributor locations for local/dev ordering flows.
WITH phd AS (
  SELECT
    "id" AS "saleChannelId",
    "storeId",
    "createdById"
  FROM "SaleChannel"
  WHERE
    "id" = 'b0000001-0000-4000-8000-000000000001'::uuid
    OR ("name" = 'PHD' AND "type" = 'distributor')
  ORDER BY
    CASE WHEN "id" = 'b0000001-0000-4000-8000-000000000001'::uuid THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO "SaleChannelLocation" (
  "id",
  "name",
  "recipientName",
  "companyName",
  "phoneNumber",
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "stateProvince",
  "postalCode",
  "country",
  "shippingNotes",
  "saleChannelId",
  "storeId",
  "createdAt",
  "updatedAt",
  "createdById"
)
SELECT
  location."id",
  location."name",
  location."recipientName",
  location."companyName",
  location."phoneNumber",
  location."email",
  location."addressLine1",
  location."addressLine2",
  location."city",
  location."stateProvince",
  location."postalCode",
  location."country",
  location."shippingNotes",
  phd."saleChannelId",
  phd."storeId",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  phd."createdById"
FROM phd
CROSS JOIN (
  VALUES
    (
      'b1000001-0000-4000-8000-000000000001'::uuid,
      'PHD East Coast DC',
      'PHD Receiving',
      'PHD',
      '+1 732-555-0184',
      'receiving.east@phd.example',
      '1250 Distribution Way',
      'Dock 4',
      'Edison',
      'New Jersey',
      '08837',
      'United States',
      'Mock location. Use dock appointment window 8 AM-4 PM.'
    ),
    (
      'b1000001-0000-4000-8000-000000000002'::uuid,
      'PHD West Coast DC',
      'PHD Receiving',
      'PHD',
      '+1 909-555-0137',
      'receiving.west@phd.example',
      '4825 Trade Center Drive',
      NULL,
      'Ontario',
      'California',
      '91761',
      'United States',
      'Mock location. Palletized freight preferred.'
    )
) AS location(
  "id",
  "name",
  "recipientName",
  "companyName",
  "phoneNumber",
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "stateProvince",
  "postalCode",
  "country",
  "shippingNotes"
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "recipientName" = EXCLUDED."recipientName",
  "companyName" = EXCLUDED."companyName",
  "phoneNumber" = EXCLUDED."phoneNumber",
  "email" = EXCLUDED."email",
  "addressLine1" = EXCLUDED."addressLine1",
  "addressLine2" = EXCLUDED."addressLine2",
  "city" = EXCLUDED."city",
  "stateProvince" = EXCLUDED."stateProvince",
  "postalCode" = EXCLUDED."postalCode",
  "country" = EXCLUDED."country",
  "shippingNotes" = EXCLUDED."shippingNotes",
  "saleChannelId" = EXCLUDED."saleChannelId",
  "storeId" = EXCLUDED."storeId",
  "updatedAt" = CURRENT_TIMESTAMP,
  "createdById" = EXCLUDED."createdById";
