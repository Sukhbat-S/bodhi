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

## Code Quality Rules (Audit Baseline: March 26, 2026)

These rules exist because the codebase accumulated debt during rapid pre-launch development. Follow them to prevent regression.

### No New `any` Without Justification
- Never add `as any` or `: any` without a `// TODO(types):` comment explaining why
- Prefer `Record<string, unknown>` over `any` for untyped JSON
- For Supabase columns missing from generated types: use `as Record<string, unknown>` not `as any`
- Current baseline: 212 `any` usages — this number should go DOWN, never up

### New Logic Needs Tests
- New Zod schemas → add validation tests in `__tests__/schemas.test.ts`
- New service methods with business logic → add unit tests
- Pure functions and helpers → always testable, always test them
- Test command: `npm test` (vitest)

### File Size Discipline
- If a file crosses 300 lines, consider splitting
- If a file crosses 500 lines, it MUST be split before the next feature
- Current 500+ line files: 41 — this is tech debt, don't add to it

### Quality Check
- Run `bash scripts/quality-check.sh` to see current metrics vs baseline
- Run `npm run typecheck` after any TypeScript changes
- Baseline stored in `scripts/quality-baseline.json`
