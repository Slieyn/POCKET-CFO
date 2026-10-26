type WindowEntry = { count: number; resetAt: number };

const windows = new Map<string, WindowEntry>();
const MAX_ENTRIES = 10_000;

function prune(now: number) {
  if (windows.size < MAX_ENTRIES) return;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

export function allowRequest(key: string, limit = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  prune(now);
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
