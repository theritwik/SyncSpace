import { describe, expect, it } from "vitest";

import {
  canDeleteDocument,
  canEditDocument,
  canManageSharing,
  resolveDocumentRole,
  shareDocumentRequestSchema,
} from "./document-permissions.js";

describe("resolveDocumentRole", () => {
  it("gives no access without workspace membership and without a grant", () => {
    expect(resolveDocumentRole({ workspaceRole: null, grantedRole: null })).toBeNull();
    expect(resolveDocumentRole({ workspaceRole: undefined, grantedRole: undefined })).toBeNull();
  });

  it.each([
    ["OWNER", "OWNER"],
    ["ADMIN", "OWNER"],
    ["MEMBER", "EDITOR"],
    ["VIEWER", "VIEWER"],
  ] as const)("maps workspace role %s to document role %s", (workspaceRole, expected) => {
    expect(resolveDocumentRole({ workspaceRole, grantedRole: null })).toBe(expected);
  });

  it("uses the grant alone for people outside the workspace", () => {
    expect(resolveDocumentRole({ workspaceRole: null, grantedRole: "VIEWER" })).toBe("VIEWER");
    expect(resolveDocumentRole({ workspaceRole: null, grantedRole: "EDITOR" })).toBe("EDITOR");
  });

  it("takes the higher of workspace role and grant", () => {
    expect(resolveDocumentRole({ workspaceRole: "VIEWER", grantedRole: "EDITOR" })).toBe("EDITOR");
    expect(resolveDocumentRole({ workspaceRole: "MEMBER", grantedRole: "OWNER" })).toBe("OWNER");
  });

  it("never lets a grant reduce what the workspace role gives", () => {
    expect(resolveDocumentRole({ workspaceRole: "MEMBER", grantedRole: "VIEWER" })).toBe("EDITOR");
    expect(resolveDocumentRole({ workspaceRole: "OWNER", grantedRole: "VIEWER" })).toBe("OWNER");
  });
});

describe("capabilities", () => {
  it("lets only owners and editors edit, and only owners share or delete", () => {
    expect(["OWNER", "EDITOR", "VIEWER"].map((role) => canEditDocument(role as never))).toEqual([
      true,
      true,
      false,
    ]);
    expect(["OWNER", "EDITOR", "VIEWER"].map((role) => canManageSharing(role as never))).toEqual([
      true,
      false,
      false,
    ]);
    expect(["OWNER", "EDITOR", "VIEWER"].map((role) => canDeleteDocument(role as never))).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe("shareDocumentRequestSchema", () => {
  it("normalises the email and accepts only known roles", () => {
    expect(shareDocumentRequestSchema.parse({ email: " Bob@Example.com ", role: "EDITOR" })).toEqual({
      email: "bob@example.com",
      role: "EDITOR",
    });
    expect(shareDocumentRequestSchema.safeParse({ email: "bob@example.com", role: "ADMIN" }).success).toBe(false);
    expect(shareDocumentRequestSchema.safeParse({ email: "nope", role: "VIEWER" }).success).toBe(false);
    expect(shareDocumentRequestSchema.safeParse({ email: "bob@example.com" }).success).toBe(false);
  });
});
