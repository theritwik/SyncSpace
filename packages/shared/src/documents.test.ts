import { describe, expect, it } from "vitest";

import {
  createDocumentRequestSchema,
  getFolderPath,
  listDocumentsQuerySchema,
  updateDocumentRequestSchema,
} from "./documents.js";

describe("document request schemas", () => {
  it("defaults a new document to an untitled document at the top level", () => {
    expect(createDocumentRequestSchema.parse({})).toEqual({
      title: "Untitled document",
      folderId: null,
    });
  });

  it("requires an update to change something", () => {
    expect(updateDocumentRequestSchema.safeParse({}).success).toBe(false);
    expect(updateDocumentRequestSchema.safeParse({ folderId: null }).success).toBe(true);
    expect(updateDocumentRequestSchema.safeParse({ title: " Notes " }).data).toEqual({
      title: "Notes",
    });
  });

  it("accepts a folder id or 'root' as list filter and bounds the limit", () => {
    expect(listDocumentsQuerySchema.parse({ folderId: "root", limit: "5" })).toEqual({
      folderId: "root",
      limit: 5,
    });
    expect(listDocumentsQuerySchema.safeParse({ folderId: "nope" }).success).toBe(false);
    expect(listDocumentsQuerySchema.safeParse({ limit: "1000" }).success).toBe(false);
  });
});

describe("getFolderPath", () => {
  const folders = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "other", parentId: null },
  ];

  it("returns the folders from the top level down to the target", () => {
    expect(getFolderPath(folders, "c").map((folder) => folder.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty path for the top level or an unknown folder", () => {
    expect(getFolderPath(folders, null)).toEqual([]);
    expect(getFolderPath(folders, "missing")).toEqual([]);
  });

  it("terminates on cyclic data", () => {
    const cyclic = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];

    expect(getFolderPath(cyclic, "x").length).toBeLessThanOrEqual(3);
  });
});
