"use client";

import { useParams } from "next/navigation";
import { createContext, use, useEffect, useState, type ReactNode } from "react";

interface ActiveWorkspaceContextValue {
  pageWorkspaceSlug: string | null;
  setPageWorkspaceSlug: (slug: string | null) => void;
}

const ActiveWorkspaceContext = createContext<ActiveWorkspaceContextValue | null>(null);

function useActiveWorkspaceContext(): ActiveWorkspaceContextValue {
  const context = use(ActiveWorkspaceContext);
  if (!context) {
    throw new Error("Active workspace hooks must be used inside ActiveWorkspaceProvider");
  }
  return context;
}

/**
 * Lets pages whose URL does not contain a workspace (such as
 * `/documents/[documentId]`) tell the sidebar which workspace they belong to.
 */
export function ActiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const [pageWorkspaceSlug, setPageWorkspaceSlug] = useState<string | null>(null);

  return (
    <ActiveWorkspaceContext value={{ pageWorkspaceSlug, setPageWorkspaceSlug }}>
      {children}
    </ActiveWorkspaceContext>
  );
}

/** The workspace of the current page: from the URL (`/w/[slug]/...`) or announced by the page. */
export function useActiveWorkspaceSlug(): string | undefined {
  const { slug } = useParams<{ slug?: string }>();
  const { pageWorkspaceSlug } = useActiveWorkspaceContext();
  return slug ?? pageWorkspaceSlug ?? undefined;
}

/** Rendered by a page to announce its workspace for as long as the page is shown. */
export function ActiveWorkspace({ slug }: { slug: string }) {
  const { setPageWorkspaceSlug } = useActiveWorkspaceContext();

  useEffect(() => {
    setPageWorkspaceSlug(slug);
    return () => setPageWorkspaceSlug(null);
  }, [slug, setPageWorkspaceSlug]);

  return null;
}
