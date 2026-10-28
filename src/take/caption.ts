/**
 * The Instagram post that goes with a take, cleaned the way it will be
 * pasted. The agent prompt asks for all of this; these make sure of it.
 */

/** Clean a hashtag list the way Instagram wants it: lowercase, no spaces, no leading #, deduplicated, and only the first five (the agent lists them strongest first). */
export function cleanHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw
      .toLowerCase()
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N}_]+/gu, "");
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 5);
}

/**
 * The caption as it will be pasted: no emoji or other pictographs, dashes
 * turned into sentence breaks, at most three short lines, and nothing past
 * 220 characters. The prompt asks for all of this; this makes sure of it.
 */
export function cleanCaption(caption: string): string {
  const text = caption
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D|\u20E3/gu, "")
    .replace(/[\u2014\u2013]|\s-{2,}\s|\s-\s/g, ". ")
    .replace(/\.\s*\.\s*/g, ". ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\. ([a-z])/g, (_m, c: string) => `. ${c.toUpperCase()}`)
    .replace(/\s*\.\s*$/gm, ".")
    .replace(/^\s*\.\s*/gm, "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 3)
    .map((l) => (/[.?!]$/.test(l) ? l : `${l}.`))
    .map((l) => l.charAt(0).toUpperCase() + l.slice(1));
  let out = lines.join("\n");
  if (out.length > 220) out = `${out.slice(0, 219).replace(/\s+\S*$/, "")}.`;
  return out;
}

/** The text to paste into Instagram: caption, blank line, hashtags. */
export function instagramText(caption: string, hashtags: string[]): string {
  const tags = cleanHashtags(hashtags)
    .map((t) => `#${t}`)
    .join(" ");
  return [cleanCaption(caption), tags].filter(Boolean).join("\n\n");
}
