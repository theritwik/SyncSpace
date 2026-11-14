"use client";

import type { WorkspaceSummary } from "@syncspace/shared";
import {
  FileTextIcon,
  HouseIcon,
  LayoutGridIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { useActiveWorkspaceSlug } from "./active-workspace";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface SidebarProps {
  workspaces: WorkspaceSummary[];
  /** Called when a link is followed; the mobile drawer uses it to close itself. */
  onNavigate?: () => void;
}

/** Sidebar contents, shared by the desktop sidebar and the mobile drawer. */
export function Sidebar({ workspaces, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const slug = useActiveWorkspaceSlug();
  const current = workspaces.find((workspace) => workspace.slug === slug);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="self-start rounded-sm px-1 font-mono text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        SyncSpace
      </Link>

      <WorkspaceSwitcher workspaces={workspaces} current={current} onNavigate={onNavigate} />

      <nav aria-label="Main" className="flex flex-col gap-6">
        {current ? (
          <NavSection label={current.name}>
            <NavLink
              href={`/w/${current.slug}`}
              icon={HouseIcon}
              active={pathname === `/w/${current.slug}`}
              onNavigate={onNavigate}
            >
              Overview
            </NavLink>
            <NavLink
              href={`/w/${current.slug}/documents`}
              icon={FileTextIcon}
              // Folder pages and single documents belong to this section too.
              active={
                pathname.startsWith(`/w/${current.slug}/documents`) ||
                pathname.startsWith(`/w/${current.slug}/folders`) ||
                // Only when the open document belongs to this workspace (see ActiveWorkspace).
                pathname.startsWith("/documents/")
              }
              onNavigate={onNavigate}
            >
              Documents
            </NavLink>
            <NavLink
              href={`/w/${current.slug}/settings`}
              icon={SettingsIcon}
              active={pathname.startsWith(`/w/${current.slug}/settings`)}
              onNavigate={onNavigate}
            >
              Settings
            </NavLink>
          </NavSection>
        ) : null}

        <NavSection label="General">
          <NavLink
            href="/dashboard"
            icon={LayoutGridIcon}
            active={pathname === "/dashboard"}
            onNavigate={onNavigate}
          >
            All workspaces
          </NavLink>
          <NavLink
            href="/shared"
            icon={UsersIcon}
            active={pathname === "/shared"}
            onNavigate={onNavigate}
          >
            Shared with me
          </NavLink>
        </NavSection>
      </nav>
    </div>
  );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="truncate px-2 text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

interface NavLinkProps {
  href: string;
  icon: LucideIcon;
  active: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}

function NavLink({ href, icon: Icon, active, onNavigate, children }: NavLinkProps) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        // Tells assistive technology which link is the current page.
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
          active
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        {children}
      </Link>
    </li>
  );
}
