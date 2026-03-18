---
name: jewelry-patterns
description: Jewelry platform (Shigtgee) conventions and patterns. Auto-load when working on jewelry/shigtgee code — admin pages, API routes, Supabase workarounds, Vercel timeout handling.
user-invocable: false
---

# Jewelry Platform (Shigtgee) Patterns

## Admin Page Pattern

All admin pages follow this structure:
- `'use client'` directive
- Auth via `getAdminHeaders()` / `getAdminJsonHeaders()` from `admin-helpers.ts`
- Never call Supabase directly from client — always through API routes
- Sequential API calls with progress bar to avoid Vercel 10s timeout

## API Route Pattern

- Zod validation for request bodies (e.g., `createProductSchema`)
- `export const maxDuration = 30` (or 60 for heavy processing)
- Return JSON with consistent error format

## Supabase Type Workaround

When new tables/columns haven't been added to generated types yet:
```typescript
(client as any).from('table_name')
```
Clean up after running `npx supabase gen types`.

## Photo Studio Pipeline

Batch processing: upload → categorize → remove background → composite on template → create products → publish

- `@imgly/background-removal-node` (ONNX) + `sharp` for compositing — $0/image
- Gemini for AI-powered categorization (`gemini-2.5-flash`) and image generation (`gemini-2.0-flash-exp`)
- Dual mode: "Template" (free bg-removal) and "AI" (Gemini generation)
- Database tables: `photo_batches`, `batch_photos`, `photo_templates`, `publish_queue`, `ai_prompts`

## Sequential API Call Pattern

One photo/product per API call to stay under Vercel 10s timeout. Frontend loops with progress bar:
```typescript
for (const item of items) {
  await fetch('/api/admin/process', { body: JSON.stringify(item) });
  setProgress(prev => prev + 1);
}
```

## Category Mapping

Photo Studio categories (`ring`, `earring`, `necklace`, `bracelet`, `chain`, `watch`, `set`) map directly to product category slugs.
