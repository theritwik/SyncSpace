"use client";

import { loginRequestSchema } from "@syncspace/shared";

import { Button } from "@/components/ui/button";

import { FormError, FormField } from "./form-field";
import { useAuthForm } from "./use-auth-form";

export function LoginForm() {
  const { fieldErrors, formError, pending, handleSubmit } = useAuthForm(
    loginRequestSchema,
    "/login",
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      <FormError message={formError} />
      <FormField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={fieldErrors.email}
      />
      <FormField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldErrors.password}
      />
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
