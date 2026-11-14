import { describe, expect, it } from "vitest";

import { generateWorkspaceSlug } from "./slug.js";

describe("generateWorkspaceSlug", () => {
  it("produces a lower-case, hyphenated slug with a random suffix", () => {
    expect(generateWorkspaceSlug("Acme Design  Team!")).toMatch(/^acme-design-team-[a-z0-9]{6}$/);
  });

  it("strips accents and falls back when nothing usable remains", () => {
    expect(generateWorkspaceSlug("Café Zürich")).toMatch(/^cafe-zurich-[a-z0-9]{6}$/);
    expect(generateWorkspaceSlug("🚀🚀")).toMatch(/^workspace-[a-z0-9]{6}$/);
  });

  it("limits the length and never starts or ends the name part with a hyphen", () => {
    const slug = generateWorkspaceSlug(`--${"a".repeat(39)} b--`);

    expect(slug).toMatch(/^a{39}-[a-z0-9]{6}$/);
  });

  it("gives two workspaces with the same name different slugs", () => {
    expect(generateWorkspaceSlug("Team")).not.toBe(generateWorkspaceSlug("Team"));
  });
});
