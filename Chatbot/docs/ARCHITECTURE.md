# Architecture

## Flow

1. Meta webhook receives inbound message
2. API validates signature and enqueues message in BullMQ
3. Worker acquires per-conversation Redis lock
4. Worker loads conversation state and stores inbound message
5. Customer context is normalized and persisted (language, search criteria, selected property, identity, reservation tracking)
6. A tools-first AI agent decides the next action instead of a fixed intent -> planner -> reply pipeline
7. Agent tools can search live property inventory, inspect one reference, retrieve RAG knowledge, read reservation status, and create a reservation demand
8. Final reply is generated only after tool results, with strict no-hallucination rules
9. Message persisted and sent to platform (Meta sender)
10. Human takeover can stop bot responses per conversation

## Website integration

- Use `POST /chat` with `platform=website` and stable `platformUserId` from frontend session/cookie.
- For website realtime, either poll `GET /conversation/:id` from authorized admin side, or add websocket extension later.

## Agent mode

- The backend now runs only through the AI agent orchestration.
- The agent can memorize client context, refine search criteria, inspect live inventory, retrieve RAG knowledge, follow a property reference, check reservation status, and create a reservation demand.

## Meta integration

- Verify webhook at `GET /webhook/meta`.
- Receive events at `POST /webhook/meta`.
- Configure Graph API tokens in `backend/.env`.

## Learning loop

- Admin submits corrections with `POST /feedback`.
- Nightly batch job (to add) should transform validated feedback into intent dictionary candidate updates.
