# Rules Reference — `cache-inspector-scan`

## Summary Matrix

| Rule ID | Type | Default Severity | Next.js Versions | Auto-Skipped When |
|---|---|---|---|---|
| `CI001` | `missing-cache-option` | `high` (15+), `low` (<=14), `medium` (unknown) | All App Router | `'use client'`, `pages/`, mutating HTTP methods (`POST`/`PUT`/`DELETE`/`PATCH`), `'use cache'`, route segment config (`dynamic`/`revalidate`/`fetchCache`) |
| `CI002` | `possible-missing-invalidation` | `medium` | 14, 15, 16+ | Calls `revalidateTag()`, `revalidatePath()`, `updateTag()`, or `refresh()` |
| `CI003` | `conflicting-cache-options` | `high` | All App Router | Never (always a real bug) |
| `CI004` | `route-handler-get-caching` | `high` (15+), `low` (<=14), `medium` (unknown) | All App Router `route.*` | Exports `dynamic`, `revalidate`, or uses `'use cache'` |
| `CI005` | `dynamic-api-with-force-static` | `high` | All App Router | No `export const dynamic = 'force-static'` |
| `CI006` | `use-cache-without-cache-life` | `low` | 15+, 16+ | Calls `cacheLife()` or `cacheTag()` |

---

## Detailed Rule Explanations & Fixes

### `CI001` — `missing-cache-option`
- **Problem**: `fetch()` in Server Components defaults to **cached indefinitely** in Next.js <=14 and **not cached at all** in Next.js 15+. Leaving caching implicit causes silent regressions during upgrades.
- **Fix**:
  ```ts
  // Opt into caching:
  await fetch(url, { cache: 'force-cache' });
  // Time-based ISR revalidation:
  await fetch(url, { next: { revalidate: 60 } });
  // Explicitly uncached:
  await fetch(url, { cache: 'no-store' });
  ```

### `CI002` — `possible-missing-invalidation`
- **Problem**: A file declares `'use server'` without calling `revalidatePath()`, `revalidateTag()`, `updateTag()`, or `refresh()`. Mutations may leave stale cached UI.
- **Fix**: Call `revalidatePath('/path')`, `revalidateTag('tag')`, or `updateTag('tag')` (Next.js 16) after mutating data.

### `CI003` — `conflicting-cache-options`
- **Problem**: Combining `cache: 'no-store'` with a positive `next: { revalidate: 60 }` (or `cache: 'force-cache'` with `revalidate: 0`) is contradictory and causes runtime errors or ignored cache directives.
- **Fix**: Keep only one caching strategy per `fetch()` call.

### `CI004` — `route-handler-get-caching`
- **Problem**: `GET` Route Handlers (`app/**/route.ts`) flipped from cached-by-default in Next.js 14 to uncached-by-default in Next.js 15+.
- **Fix**: Add `export const dynamic = 'force-static'` (or `export const revalidate = 60` / `export const dynamic = 'force-dynamic'`).

### `CI005` — `dynamic-api-with-force-static`
- **Problem**: Exporting `export const dynamic = 'force-static'` while invoking request-bound APIs (`cookies()`, `headers()`, `draftMode()`) causes empty values or static generation failures.
- **Fix**: Remove `force-static` or move dynamic reads out of statically forced segments.

### `CI006` — `use-cache-without-cache-life`
- **Problem**: Using Next.js 15/16 `'use cache'` without `cacheLife()` or `cacheTag()` relies on implicit defaults and makes targeted invalidation harder.
- **Fix**: Add `cacheLife('minutes')` and/or `cacheTag('products')`.

---

## Inline Suppressions

Suppress a single line (all rules or specific rule IDs):
```ts
// cache-inspector-ignore-next-line CI001
const res = await fetch('https://api.example.com/health');
```

Suppress an entire file:
```ts
// cache-inspector-ignore-file CI002
```

## Project Configuration (`.cacheinspectorrc.json`)

```json
{
  "roots": ["app", "src/app", "lib", "src/lib", "actions"],
  "ignore": ["app/legacy", "generated"],
  "failOn": "high",
  "rules": {
    "CI002": "low",
    "CI006": "off"
  }
}
```
