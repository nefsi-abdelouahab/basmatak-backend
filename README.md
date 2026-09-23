# Basmatak Tatatoua — Backend

Volunteer marketplace backend for **Basmatak Tatatoua (بصمتك تطوع)**.

## Stack

- [NestJS 10](https://nestjs.com) + TypeScript (strict)
- MongoDB via [Mongoose 8](https://mongoosejs.com)
- JWT access/refresh with rotated, hashed sessions
- In-memory throttler, in-process events (single-instance, free-tier)
- Tests run against `mongodb-memory-server` (replica-set capable)

## Prerequisites

- Node >= 20 LTS, npm >= 10
- Local MongoDB `mongod` for `npm run start:dev` when `MONGO_URI` is unset
  (or start one ad-hoc with `npx mongodb-memory-server`)

## Setup

```bash
npm install
cp .env.example .env   # fill in values (see comments)
```

## Running

```bash
npm run start:dev      # dev (watch)
npm run build          # compile to dist/
npm run start:prod     # run compiled build
```

## Testing

```bash
npm run lint           # eslint (--fix)
npm test               # unit tests (in-memory MongoDB)
npm run test:e2e       # e2e tests (in-memory MongoDB, replica set)
```

All automated tests use an in-memory MongoDB replica set — no external DB needed.
The only database rig for every unit and e2e test lives in `test/utils/test-db.ts`.

## API

- Global prefix: `/api/v1`
- Health: `GET /api/v1/health` → `{ status: 'ok', version }`

## Specs

- Roadmap: [`docs/ROADMAP.md`](../docs/ROADMAP.md)
- Source of truth for scope: [`backend-inventory.md`](../backend-inventory.md)
- OpenSpec changes: `openspec/changes/` (see `openspec status`)

## Infrastructure notes

- Atlas network rule `0.0.0.0/0` is a **temporary-at-MVP** convenience so the
  app can connect from anywhere. Restrict the allowlist to known static IPs /
  office ranges before production.