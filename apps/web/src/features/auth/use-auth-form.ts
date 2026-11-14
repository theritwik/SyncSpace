"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { z } from "zod";

import { sendAuthRequest, type FieldErrors } from "./auth-client";

/**
 * Shared submit logic of the login and registration forms:
 * validate in the browser, send to the API, then show errors or move on.
 *
 * Browser-side validation only gives faster feedback. The API validates the
 * same Zod schema again and is the one that actually enforces the rules.
 */
export function useAuthForm(schema: z.ZodType, path: "/login" | "/register") {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function showErrors(form: HTMLFormElement, errors: FieldErrors, message: string | null) {
    setFieldErrors(errors);
    setFormError(message);

    // Move focus to the first field with a problem so keyboard and
    // screen-reader users land where the fix is needed.
    const firstInvalid = Object.keys(errors)[0];
    const field = firstInvalid ? form.elements.namedItem(firstInvalid) : null;
    if (field instanceof HTMLElement) field.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path.join(".")] ??= issue.message;
      }
      showErrors(form, errors, null);
      return;
    }

    setPending(true);
    const result = await sendAuthRequest(path, parsed.data);

    if (result.ok) {
      // Stay in the pending state while the next page loads.
      router.replace("/account");
      router.refresh();
      return;
    }

    setPending(false);
    const hasFieldErrors = Object.keys(result.fieldErrors).length > 0;
    showErrors(form, result.fieldErrors, hasFieldErrors ? null : result.message);
  }

  return { fieldErrors, formError, pending, handleSubmit };
}
