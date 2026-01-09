/**
 * Extract the first relation ID from a webhook property.
 * Returns null if the property is missing, not a relation, or has no relations.
 */
export function extractFirstRelationIdFromWebhookProperties(
  props: Record<string, any>,
  propName: string,
): string | null {
  const prop = props[propName];
  if (!prop || typeof prop !== "object") return null;

  if ((prop as any).type !== "relation") return null;

  const relation = Array.isArray((prop as any).relation) ? (prop as any).relation : [];
  if (relation.length === 0) return null;

  const first = relation[0];
  return first && typeof first.id === "string" ? first.id : null;
}

