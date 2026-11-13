# superdaddy-sync — Zero-knowledge encrypted relay

The only backend of [SuperDaddy](../README.md): a dumb Cloudflare Worker + KV that stores
**client-encrypted blobs** (AES-256-GCM). The server has no keys and cannot decrypt anything.

## Protocol

```
GET  /r/:room   → 404 (empty) | { at, blob }
POST /r/:room   body { blob } → { ok, at }
```

- `room` = 16-char unguessable code (no 0/1/I/O/L); it is the KV key **and** the only auth
- `blob` = `base64(iv).base64(ciphertext)`, validated by shape, max 2 MB
- Rate limit: 10 writes/min per room (best effort per isolate)
- Entries expire after 90 days without a write

## Deploy (self-host in 3 commands)

```bash
cd sync-worker
npx wrangler kv namespace create SYNC   # copy the printed id into wrangler.toml
npx wrangler deploy
```

Then set the URL in [`src/utils/sync.js`](../src/utils/sync.js) (`RELAY`) if you self-host.
End-to-end test: see `tests/sync.test.js` for the crypto contract your relay must carry.

## Threat model

- Server operator (or a breach of the KV): sees ciphertext only
- Wrong room code → wrong salt → AES-GCM auth failure (no oracle)
- Abuse: unguessable room codes + write rate limit + size cap + TTL
- Trust boundary: the family code IS the access — share it like a password
