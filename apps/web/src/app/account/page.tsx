import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/features/auth/logout-button";
import { getCurrentUser } from "@/features/auth/session";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <Link href="/" className="self-start font-mono text-sm text-muted-foreground hover:text-foreground">
        SyncSpace
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your account…</p>}>
        <AccountDetails />
      </Suspense>
    </main>
  );
}

/** Protected content: rendered only after the API has confirmed the session. */
async function AccountDetails() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const memberSince = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(
    new Date(user.createdAt),
  );

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome, {user.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>You are signed in.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-[8rem_1fr] sm:gap-y-3">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium break-words">{user.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium break-all">{user.email}</dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="font-medium">{memberSince}</dd>
          </dl>
          <LogoutButton />
        </CardContent>
      </Card>
    </>
  );
}
