import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SystemStatus, SystemStatusFallback } from "@/features/system-status/system-status";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-4">
        <p className="font-mono text-sm text-muted-foreground">SyncSpace</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          A collaborative workspace for documents.
        </h1>
        <p className="text-lg text-muted-foreground text-pretty">
          The project foundation is in place: web app, API, collaboration service and database.
          Product features are under development.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>System status</CardTitle>
          <CardDescription>Live result of the API health check.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<SystemStatusFallback />}>
            <SystemStatus />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
