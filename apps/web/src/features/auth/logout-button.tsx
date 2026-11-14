"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { sendAuthRequest } from "./auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setPending(true);
    setError(null);
    const result = await sendAuthRequest("/logout");

    if (result.ok) {
      router.replace("/login");
      router.refresh();
      return;
    }

    setPending(false);
    setError(result.message);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="outline" onClick={handleLogout} disabled={pending} aria-busy={pending}>
        {pending ? "Logging out…" : "Log out"}
      </Button>
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    </div>
  );
}
