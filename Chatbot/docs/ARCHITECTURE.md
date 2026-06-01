# Architecture

## Flow

1. Meta webhook receives inbound message
2. API validates signature and enqueues message in BullMQ
3. Worker acquires per-conversation Redis lock
4. Worker loads conversation state and stores inbound message
5. Intent extraction + multilingual parsing (OpenAI)
6. RAG context retrieval (Qdrant)
7. Property search in MySQL with availability check
8. Response generation with strict no-hallucination rules
9. Message persisted and sent to platform (Meta sender)
10. Human takeover can stop bot responses per conversation

## Website integration

- Use `POST /chat` with `platform=website` and stable `platformUserId` from frontend session/cookie.
- For website realtime, either poll `GET /conversation/:id` from authorized admin side, or add websocket extension later.

## Meta integration

- Verify webhook at `GET /webhook/meta`.
- Receive events at `POST /webhook/meta`.
- Configure Graph API tokens in `backend/.env`.

## Learning loop

- Admin submits corrections with `POST /feedback`.
- Nightly batch job (to add) should transform validated feedback into intent dictionary candidate updates.
