// Chosen to be distinguishable from each other and readable with white text.
const CURSOR_COLORS = [
  "#2563eb",
  "#c2410c",
  "#15803d",
  "#7e22ce",
  "#be123c",
  "#0e7490",
  "#a16207",
  "#4338ca",
];

/** The same user always gets the same colour, on every device. */
export function colorForUser(userId: string): string {
  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length] ?? "#2563eb";
}
