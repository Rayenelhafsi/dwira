# Chatbot Monorepo

Production-ready multilingual AI booking assistant for WhatsApp, Messenger, Instagram, and website chat.

## Structure

- `backend/`: Express API + BullMQ worker + Prisma + RAG
- `dashboard/`: React admin dashboard
- `docs/`: Architecture and runbook

## Quick start

1. Copy env:
   - `backend/.env.example` -> `backend/.env`
2. Setup DB and Prisma:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
3. Run API:
   - `npm run dev`
4. Run worker:
   - `npm run worker`
5. Run dashboard:
   - in `dashboard/`: `npm run dev`
