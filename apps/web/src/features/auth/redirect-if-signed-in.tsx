import { redirect } from "next/navigation";

import { getCurrentUser } from "./session";

/** Sends users who already have a valid session away from the login and registration pages. */
export async function RedirectIfSignedIn() {
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }
  return null;
}
