"use client";

import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useCreateWorkspace } from "./create-workspace";

export function NewWorkspaceButton({ label = "New workspace" }: { label?: string }) {
  const openCreateWorkspace = useCreateWorkspace();

  return (
    <Button onClick={openCreateWorkspace}>
      <PlusIcon aria-hidden />
      {label}
    </Button>
  );
}
