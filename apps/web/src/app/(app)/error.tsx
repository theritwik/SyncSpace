"use client";

import { TriangleAlertIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** Shown inside the dashboard frame when a page fails to load (e.g. the API is down). */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={TriangleAlertIcon}
        title="This page could not be loaded"
        description="Something went wrong while loading your data. Your work is not affected. Please try again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
