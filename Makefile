.PHONY: db-reset up clear-next-image-cache

db-reset:
	npx prisma migrate reset --force
	node scripts/check-dev-seed.mjs

db-migrate:
	npx prisma migrate dev

up:
	npm run dev

clear-next-image-cache:
	node -e "const fs=require('fs'); for (const p of ['.next/cache/images', '.next/dev/cache/images']) { fs.rmSync(p, { recursive: true, force: true }); console.log('cleared', p); }"
