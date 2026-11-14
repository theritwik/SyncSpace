"use client";

import type { WorkspaceSummary } from "@syncspace/shared";
import { LayoutGridIcon, PlusIcon, SearchIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useCreateWorkspace } from "@/features/workspaces/create-workspace";
import { WorkspaceAvatar } from "@/features/workspaces/workspace-avatar";

const noopSubscribe = () => () => {};

/** True on Apple devices. Read on the client only, so server and first client render agree. */
function useIsApple(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
}

/**
 * Search entry in the header plus the dialog it opens (also Ctrl/⌘+K).
 * It searches what exists today: the user's workspaces and a few navigation
 * actions. Arrow keys move, Enter selects, Escape closes.
 */
export function CommandMenu({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const router = useRouter();
  const openCreateWorkspace = useCreateWorkspace();
  const isApple = useIsApple();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search workspaces"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-9 w-9 items-center justify-center gap-2 rounded-md border bg-background text-sm text-muted-foreground shadow-xs outline-none hover:bg-accent hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-64 sm:justify-start sm:px-3"
      >
        <SearchIcon aria-hidden className="size-4 shrink-0" />
        <span className="hidden flex-1 text-left sm:inline">Search workspaces…</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-[0.6875rem] font-medium sm:inline">
          {isApple ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Search your workspaces or jump to a page."
        showCloseButton={false}
      >
        <CommandInput placeholder="Search workspaces and pages…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {workspaces.length > 0 ? (
            <CommandGroup heading="Workspaces">
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.id}
                  // The slug keeps values unique when two workspaces share a name.
                  value={`${workspace.name} ${workspace.slug}`}
                  onSelect={() => run(() => router.push(`/w/${workspace.slug}`))}
                >
                  <WorkspaceAvatar name={workspace.name} slug={workspace.slug} size="sm" />
                  <span className="truncate">{workspace.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {workspaces.length > 0 ? <CommandSeparator /> : null}
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => run(() => router.push("/dashboard"))}>
              <LayoutGridIcon aria-hidden />
              All workspaces
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/account"))}>
              <UserIcon aria-hidden />
              Account
            </CommandItem>
            <CommandItem onSelect={() => run(openCreateWorkspace)}>
              <PlusIcon aria-hidden />
              Create workspace
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
