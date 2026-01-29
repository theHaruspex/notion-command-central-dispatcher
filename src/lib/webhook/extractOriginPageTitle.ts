export function extractOriginPageTitle(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b: any = body as any;

  const dataProps = b?.data?.properties;
  const fromName = readTitleFromProp(dataProps?.Name);
  if (fromName) return fromName;

  const props = b?.properties ?? b?.data?.properties;
  if (!props || typeof props !== "object") return null;

  for (const prop of Object.values(props)) {
    const title = readTitleFromProp(prop);
    if (title) return title;
  }

  return null;
}

function readTitleFromProp(prop: any): string | null {
  if (!prop || typeof prop !== "object") return null;
  if (prop.type !== "title" || !Array.isArray(prop.title)) return null;
  const text = prop.title
    .map((t: any) => t.plain_text || t.text?.content || "")
    .join("")
    .trim();
  return text ? text : null;
}
