import Link from "next/link";
import { Suspense } from "react";

import { RedirectIfSignedIn } from "@/features/auth/redirect-if-signed-in";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Link href="/" className="self-start font-mono text-sm text-muted-foreground hover:text-foreground">
        SyncSpace
      </Link>
      {children}
      {/* Reads the session cookie, so it renders at request time behind Suspense. */}
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
    </main>
  );
}
