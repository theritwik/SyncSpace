import { Suspense, type ReactNode } from "react";

import { requireUser } from "@/features/auth/session";
import { AppShell } from "@/features/dashboard/app-shell";
import { AppShellSkeleton } from "@/features/dashboard/skeletons";
import { listWorkspaces } from "@/features/workspaces/data";

/** Layout of every signed-in page. Nothing below it renders without a valid session. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const workspaces = await listWorkspaces();

  return (
    <AppShell user={user} workspaces={workspaces}>
      {children}
    </AppShell>
  );
}
