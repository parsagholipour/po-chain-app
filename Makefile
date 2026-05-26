.PHONY: db-reset up docker-dev docker-dev-build docker-dev-down dev-services clear-next-image-cache

db-reset:
	npx prisma migrate reset --force
	node scripts/check-dev-seed.mjs

db-migrate:
	npx prisma migrate dev

up:
	npm run dev

docker-dev:
	docker compose -f docker-compose.dev.yml run --rm --no-deps app npm install
	docker compose -f docker-compose.dev.yml up

docker-dev-build:
	docker compose -f docker-compose.dev.yml up --build

docker-dev-down:
	docker compose -f docker-compose.dev.yml down

dev-services:
	node scripts/print-dev-services.mjs

clear-next-image-cache:
	node -e "const fs=require('fs'); for (const p of ['.next/cache/images', '.next/dev/cache/images']) { fs.rmSync(p, { recursive: true, force: true }); console.log('cleared', p); }"
