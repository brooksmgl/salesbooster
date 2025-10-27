# Etsy Listing Generator (Supabase + Next.js)

Minimal, production-ready app to generate Etsy listing assets (title, tags, description, FAQs) with optional image READ using OpenAI gpt-4o-mini. Embeddable via `<iframe>` on WordPress.

## Features
- Shared workspace (no sign-in required) with Supabase persistence
- Private Storage with signed upload URLs
- RLS-secured Postgres (users see only their data)
- API endpoints for listings and OpenAI generation
- Compact React UI for chat + actions, copy buttons
- Deep link via `?l=<listingId>` for embeds

## Environment
Create `.env.local` from `.env.example` and provide:
- Supabase project URL (`NEXT_PUBLIC_SUPABASE_URL`)
- Service role key (`SUPABASE_SERVICE_ROLE`)
- OpenAI key (`OPENAI_API_KEY`)
- `ALLOWED_ORIGIN` for whichever site will embed the iframe (use `http://localhost:3000` when testing locally)

Grant access by inserting allowed emails into `public.users` (keep the `id` column UUID consistent with your app). The sign-in screen only checks that the email exists.

## SQL
Run `sql/schema.sql` in Supabase SQL Editor. This creates tables, RLS, and a private `listing-images` bucket with policies.

## Local Dev
```bash
pnpm i # or npm i
npm run dev
```
Set `ALLOWED_ORIGIN=http://localhost:3000` during local test if embedding elsewhere.

## Deploy
- Vercel (recommended). Set env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `OPENAI_API_KEY`, `ALLOWED_ORIGIN`.
- Netlify also works with Next 14 adapter.

## WordPress Embed
```html
<iframe src="https://yourapp.example.com/app" width="100%" height="900" style="border:0" allow="clipboard-write"></iframe>
```

## API Summary
- `POST /api/auth/login` → set session cookie for email-only login
- `DELETE /api/auth/login` → clear session
- `GET /api/auth/session` → fetch active user (via cookie)
- `POST /api/listings` → create draft listing
- `GET /api/listings` → list listings (paginated)
- `GET /api/listings/:id` → fetch one (+history)
- `DELETE /api/listings/:id` → remove a listing
- `POST /api/listings/:id/upload-url` → signed upload URL (Supabase Storage)
- `POST /api/listings/:id/generate` → modes: chat | read | title | tags | description | faqs

## Notes & Limits
- In-memory rate limiter; for multi-region use Redis/Upstash
- Storage uploads via `createSignedUploadUrl` (private bucket). Generate signed *download* URLs when needed on server.
- Image READ sends `{ type: 'image_url', image_url: <signed path> }` to OpenAI.
- BB-code description uses provided template; adjust in `lib/prompts.ts`.
- CORS: `ALLOWED_ORIGIN` must match your WordPress origin.
