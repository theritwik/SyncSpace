"use client";

import type { WorkspaceSummary } from "@syncspace/shared";
import { CheckIcon, ChevronsUpDownIcon, LayoutGridIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateWorkspace } from "@/features/workspaces/create-workspace";
import { WorkspaceAvatar } from "@/features/workspaces/workspace-avatar";

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary | undefined;
  onNavigate?: () => void;
}

export function WorkspaceSwitcher({ workspaces, current, onNavigate }: WorkspaceSwitcherProps) {
  const openCreateWorkspace = useCreateWorkspace();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={current ? `Current workspace: ${current.name}. Switch workspace` : "Select a workspace"}
        className="flex w-full items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-left text-sm shadow-xs outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent"
      >
        {current ? (
          <WorkspaceAvatar name={current.name} slug={current.slug} size="sm" />
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <LayoutGridIcon aria-hidden className="size-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {current ? current.name : "Select a workspace"}
        </span>
        <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        {workspaces.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No workspaces yet.</p>
        ) : (
          workspaces.map((workspace) => (
            <DropdownMenuItem key={workspace.id} asChild>
              <Link href={`/w/${workspace.slug}`} onClick={onNavigate}>
                <WorkspaceAvatar name={workspace.name} slug={workspace.slug} size="sm" />
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {workspace.id === current?.id ? (
                  <>
                    <CheckIcon aria-hidden />
                    <span className="sr-only">(current)</span>
                  </>
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onNavigate?.();
            openCreateWorkspace();
          }}
        >
          <PlusIcon aria-hidden />
          Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
