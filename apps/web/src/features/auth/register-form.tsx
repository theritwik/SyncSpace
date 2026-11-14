"use client";

import { PASSWORD_MIN_LENGTH, registerRequestSchema } from "@syncspace/shared";

import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";

import { useAuthForm } from "./use-auth-form";

export function RegisterForm() {
  const { fieldErrors, formError, pending, handleSubmit } = useAuthForm(
    registerRequestSchema,
    "/register",
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      <FormError message={formError} />
      <FormField
        name="name"
        label="Name"
        type="text"
        autoComplete="name"
        required
        error={fieldErrors.name}
      />
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
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={fieldErrors.password}
      />
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
