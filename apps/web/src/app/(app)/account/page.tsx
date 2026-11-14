import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/features/auth/logout-button";
import { requireUser } from "@/features/auth/session";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="space-y-8">
      <PageHeader title="Account" description="Your personal details." />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Profile</h2>
          </CardTitle>
          <CardDescription>Editing your profile is not available yet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-[8rem_1fr] sm:gap-y-3">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium break-words">{user.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium break-all">{user.email}</dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd className="font-medium">{formatDate(user.createdAt)}</dd>
          </dl>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
