const dateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** Formats an ISO timestamp as e.g. "Nov 14, 2026". */
export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/**
 * Formats an ISO timestamp as e.g. "Nov 14, 2026, 12:20 PM UTC". Times are
 * rendered on the server, which does not know the reader's time zone, so they
 * are shown in UTC and labelled as such.
 */
export function formatDateTime(isoDate: string): string {
  return `${dateTimeFormatter.format(new Date(isoDate))} UTC`;
}

/** "Ada Lovelace" -> "AL". Used for avatar placeholders. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => Array.from(word ?? "")[0]?.toUpperCase() ?? "").join("") || "?";
}

export function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
