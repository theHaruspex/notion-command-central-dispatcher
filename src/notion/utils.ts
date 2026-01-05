export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}


