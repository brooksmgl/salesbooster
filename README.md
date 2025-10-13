# Sales Booster Functions

- Primary endpoint: https://<site>.netlify.app/.netlify/functions/chat
- Smoke test endpoint: https://<site>.netlify.app/.netlify/functions/hello

```bash
curl -X POST https://<site>.netlify.app/.netlify/functions/chat \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","listingId":"test-listing","mode":"title","message":"handmade wooden bowl"}'
```
