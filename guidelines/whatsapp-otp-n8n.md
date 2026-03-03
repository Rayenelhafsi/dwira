# WhatsApp OTP via n8n (Unofficial)

This project generates and verifies OTP codes in the Node API. `n8n` is used only to deliver the code.

## Warning

This is an unofficial WhatsApp automation approach. It can break, get rate-limited, or get the sender account blocked.

Use it only for testing or low-risk internal trials.

## Backend configuration

Add these values to `.env`:

```env
OTP_PROVIDER_WEBHOOK_URL=https://your-n8n-host/webhook/dwira-whatsapp-otp
OTP_PROVIDER_WEBHOOK_SECRET=change_me
ALLOW_OTP_IN_RESPONSE=0
```

For local testing without delivery:

```env
ALLOW_OTP_IN_RESPONSE=1
```

Then restart the API server.

## Payload sent by Dwira to n8n

`POST` JSON:

```json
{
  "telephone": "+21652080695",
  "code": "123456",
  "brand": "Dwira Immobilier",
  "message": "Votre code OTP Dwira Immobilier est 123456. Il expire dans 5 minutes."
}
```

Optional header:

```text
x-webhook-secret: change_me
```

The n8n webhook should reply with HTTP `200` to `299`.

## Suggested n8n flow

1. Webhook node
2. IF node checking `x-webhook-secret`
3. Function or Set node to normalize the phone number
4. HTTP Request node or code node calling your unofficial WhatsApp sender
5. Respond to Webhook node with:

```json
{
  "ok": true
}
```

## Expected webhook validation

In n8n, reject the request if the secret does not match:

```js
const expected = 'change_me';
const actual = $json.headers?.['x-webhook-secret'] || $headers['x-webhook-secret'];
if (actual !== expected) {
  throw new Error('Invalid webhook secret');
}
return items;
```

## Sender contract

Your unofficial WhatsApp sender must accept:

- destination phone number
- OTP message text

And it should send exactly the `message` value from Dwira when possible.

## Failure behavior

If n8n returns non-2xx, Dwira treats OTP delivery as failed and the login step stops.
