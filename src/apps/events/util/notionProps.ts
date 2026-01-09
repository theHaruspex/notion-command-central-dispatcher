export function rt(content: string) {
  return { rich_text: [{ type: "text", text: { content } }] };
}

export function title(content: string) {
  // use title property id key `title` in caller
  return { title: [{ type: "text", text: { content } }] };
}

export function dateIso(iso: string) {
  return { date: { start: iso } };
}

export function urlValue(u: string | null | undefined) {
  return { url: u ?? null };
}



