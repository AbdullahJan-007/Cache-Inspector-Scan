// Heuristic, clearly labeled as such: a file with a Server Action that
// never calls revalidateTag/revalidatePath *might* leave stale data behind
// after a mutation. This can false-positive (the invalidation might live in
// a different file) — it's a nudge to go check, not a certainty.
export function checkMissingInvalidation(sourceText) {
  const hasServerAction = /['"]use server['"]/.test(sourceText);
  if (!hasServerAction) return null;

  // Require an actual call — word immediately followed by "(" — not just
  // the word appearing anywhere. Otherwise a comment that mentions
  // "revalidateTag" (even to say it's missing) would count as present.
  const hasInvalidation = /\b(revalidateTag|revalidatePath)\s*\(/.test(sourceText);
  if (hasInvalidation) return null;

  return {
    type: 'possible-missing-invalidation',
    message:
      "This file has a Server Action ('use server') but no revalidateTag or revalidatePath call in it. " +
      'If this action changes data, pages showing that data may stay stale afterward — worth checking.',
    severity: 'medium',
  };
}
