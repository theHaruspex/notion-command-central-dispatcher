export function extractTitleFromWebhookProperties(props: Record<string, any>): string {
  for (const p of Object.values(props)) {
    if (p && typeof p === "object" && (p as any).type === "title" && Array.isArray((p as any).title)) {
      return (p as any).title.map((t: any) => t.plain_text || t.text?.content || "").join("");
    }
  }
  return "";
}

export function extractStatusNameFromWebhookProperties(
  props: Record<string, any>,
  propName: string,
): string {
  const prop = props[propName];
  if (prop && typeof prop === "object" && (prop as any).type === "status") {
    return ((prop as any).status?.name as string | undefined) ?? "";
  }
  return "";
}


