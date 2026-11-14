import type { PublicUser, WorkspaceSummary } from "@syncspace/shared";
import type { ReactNode } from "react";

import { CreateWorkspaceProvider } from "@/features/workspaces/create-workspace";

import { CommandMenu } from "./command-menu";
import { MobileSidebar } from "./mobile-sidebar";
import { Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

interface AppShellProps {
  user: PublicUser;
  workspaces: WorkspaceSummary[];
  children: ReactNode;
}

/** The frame around every signed-in page: sidebar, header and the page content. */
export function AppShell({ user, workspaces, children }: AppShellProps) {
  return (
    <CreateWorkspaceProvider>
      {/* First focusable element: lets keyboard users jump past the navigation. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <div className="flex min-h-svh flex-1">
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 overflow-y-auto border-r bg-sidebar md:block">
          <Sidebar workspaces={workspaces} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6">
            <MobileSidebar workspaces={workspaces} />
            <CommandMenu workspaces={workspaces} />
            <div className="ml-auto">
              <UserMenu user={user} />
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 outline-none sm:px-6 lg:px-8"
          >
            {children}
          </main>
        </div>
      </div>
    </CreateWorkspaceProvider>
  );
}
