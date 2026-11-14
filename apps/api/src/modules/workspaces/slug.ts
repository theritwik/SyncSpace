import { randomInt } from "node:crypto";

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const SUFFIX_LENGTH = 6;
const MAX_BASE_LENGTH = 40;

/**
 * Builds the URL identifier for a new workspace, e.g. "Acme Design" ->
 * "acme-design-k3x9qa". The random suffix makes collisions between
 * workspaces with the same name very unlikely; the unique index in the
 * database is what actually guarantees uniqueness.
 */
export function generateWorkspaceSlug(name: string): string {
  const base = name
    .normalize("NFKD") // split accented letters into letter + accent...
    .replace(/[̀-ͯ]/g, "") // ...and drop the accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_BASE_LENGTH)
    .replace(/^-+|-+$/g, "");

  let suffix = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += SUFFIX_ALPHABET[randomInt(SUFFIX_ALPHABET.length)];
  }

  // Names without any latin letters or digits (e.g. emoji) have an empty base.
  return `${base || "workspace"}-${suffix}`;
}
