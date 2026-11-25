# Rules Reference

## Summary

| Rule | Type | Default Severity | Applies To | Skipped When |
|---|---|---|---|---|
| `CI001` | `missing-cache-option` | `high` (Next 15+), `low` (<=14), `medium` (unknown) | App Router & shared server files | `'use client'`, `pages/`, mutating methods (`POST`, `PUT`, `DELETE`, `PATCH`), `'use cache'`, route segment config (`dynamic`, `revalidate`, `fetchCache`) |
| `CI002` | `possible-missing-invalidation` | `medium` | Files with `'use server'` | Calls `revalidateTag()`, `revalidatePath()`, `updateTag()`, or `refresh()` |
| `CI003` | `conflicting-cache-options` | `high` | App Router & shared server files | Never |
| `CI004` | `route-handler-get-caching` | `high` (Next 15+), `low` (<=14), `medium` (unknown) | App Router `route.*` files exporting `GET` | Exports `dynamic`, `revalidate`, or uses `'use cache'` |
| `CI005` | `dynamic-api-with-force-static` | `high` | Files exporting `dynamic = 'force-static'` | No `cookies()`, `headers()`, or `draftMode()` call |
| `CI006` | `use-cache-without-cache-life` | `low` | Files with `'use cache'` | Calls `cacheLife()` or `cacheTag()` |

## Rule Details

### `CI001` (`missing-cache-option`)

`fetch()` in Server Components cached indefinitely by default in Next.js 14 and earlier, and defaults to uncached in Next.js 15+. Leaving caching implicit makes upgrades unpredictable.

```ts
// Explicitly cached
await fetch(url, { cache: 'force-cache' });

// Time-based revalidation (ISR)
await fetch(url, { next: { revalidate: 60 } });

// Explicitly uncached
await fetch(url, { cache: 'no-store' });
```

### `CI002` (`possible-missing-invalidation`)

A file with `'use server'` never calls `revalidatePath()`, `revalidateTag()`, `updateTag()`, or `refresh()`. If the action mutates stored data, cached views can stay stale.

```ts
'use server';
import { revalidateTag } from 'next/cache';

export async function updateProduct(id: string) {
  await db.products.update(id);
  revalidateTag('products');
}
```

### `CI003` (`conflicting-cache-options`)

Combining `cache: 'no-store'` with a positive `next: { revalidate: 60 }` (or `cache: 'force-cache'` with `revalidate: 0`) is contradictory. Keep a single caching strategy per `fetch()` call.

### `CI004` (`route-handler-get-caching`)

App Router `GET` Route Handlers (`app/**/route.ts`) flipped from cached-by-default in Next.js 14 to uncached-by-default in Next.js 15+. Export `dynamic` or `revalidate` to make intent explicit:

```ts
export const dynamic = 'force-static';
// or: export const revalidate = 60;

export async function GET() {
  return Response.json({ ok: true });
}
```

### `CI005` (`dynamic-api-with-force-static`)

Exporting `export const dynamic = 'force-static'` while calling `cookies()`, `headers()`, or `draftMode()` returns empty values or breaks static generation. Remove `force-static` or avoid request-bound APIs in static routes.

### `CI006` (`use-cache-without-cache-life`)

Using `'use cache'` without `cacheLife()` or `cacheTag()` relies on implicit expiration defaults. Call `cacheLife('minutes')` and/or `cacheTag('key')` inside the cached scope.

## Suppressions & Configuration

Suppress a single line:

```ts
// cache-inspector-ignore-next-line CI001
const res = await fetch('https://api.example.com/health');
```

Suppress an entire file:

```ts
// cache-inspector-ignore-file CI002
```

Configure rules per project in `.cacheinspectorrc.json`:

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
