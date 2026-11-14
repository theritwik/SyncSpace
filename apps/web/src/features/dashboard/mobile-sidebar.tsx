"use client";

import type { WorkspaceSummary } from "@syncspace/shared";
import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { Sidebar } from "./sidebar";

/** On small screens the sidebar lives in a drawer opened from the header. */
export function MobileSidebar({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
          <MenuIcon aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Switch workspace or go to another page.</SheetDescription>
        </SheetHeader>
        <Sidebar workspaces={workspaces} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
