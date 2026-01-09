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

export function extractStateValueFromWebhookProperties(props: Record<string, any>, propName: string): string | null {
  const prop = props[propName];
  if (!prop || typeof prop !== "object") {
    return null;
  }

  const type = (prop as any).type;
  if (type === "status") {
    return ((prop as any).status?.name as string | undefined) ?? "";
  }
  if (type === "select") {
    return ((prop as any).select?.name as string | undefined) ?? "";
  }
  if (type === "rich_text") {
    const rt = Array.isArray((prop as any).rich_text) ? (prop as any).rich_text : [];
    return rt.map((t: any) => t.plain_text || t.text?.content || "").join("");
  }
  if (type === "title") {
    const title = Array.isArray((prop as any).title) ? (prop as any).title : [];
    return title.map((t: any) => t.plain_text || t.text?.content || "").join("");
  }

  try {
    return JSON.stringify(prop);
  } catch {
    return "";
  }
}



