import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const users = await client.query(`
  SELECT u.id, u.email, u."keycloakSub", u.type,
    COALESCE(json_agg(json_build_object('storeId', us."storeId", 'slug', s.slug)) FILTER (WHERE us."storeId" IS NOT NULL), '[]') AS stores
  FROM "User" u
  LEFT JOIN "UserStore" us ON us."userId" = u.id
  LEFT JOIN "Store" s ON s.id = us."storeId"
  GROUP BY u.id
  ORDER BY u."createdAt"
`);

const manufacturers = await client.query(`
  SELECT m.id, m.name, m."storeId", s.slug AS store_slug
  FROM "Manufacturer" m
  JOIN "Store" s ON s.id = m."storeId"
`);

console.log(JSON.stringify({ users: users.rows, manufacturers: manufacturers.rows }, null, 2));
await client.end();
