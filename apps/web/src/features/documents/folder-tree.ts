import type { FolderSummary } from "@syncspace/shared";

export interface FolderTreeEntry {
  folder: FolderSummary;
  /** 0 for top-level folders. */
  depth: number;
}

/** Orders folders as a tree (each folder followed by its subfolders), sorted by name. */
export function flattenFolderTree(folders: FolderSummary[]): FolderTreeEntry[] {
  const childrenByParent = new Map<string | null, FolderSummary[]>();
  for (const folder of folders) {
    const siblings = childrenByParent.get(folder.parentId) ?? [];
    siblings.push(folder);
    childrenByParent.set(folder.parentId, siblings);
  }

  const entries: FolderTreeEntry[] = [];
  function visit(parentId: string | null, depth: number) {
    const children = childrenByParent.get(parentId) ?? [];
    for (const folder of children.toSorted((a, b) => a.name.localeCompare(b.name))) {
      entries.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  }
  visit(null, 0);

  return entries;
}
