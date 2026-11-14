"use client";

import {
  documentPermissionResponseSchema,
  documentRoleSchema,
  shareDocumentRequestSchema,
  type DocumentPermissionSummary,
  type DocumentRole,
} from "@syncspace/shared";
import { UserPlusIcon, UsersIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DOCUMENT_ROLE_DESCRIPTIONS, DOCUMENT_ROLE_LABELS } from "@/features/workspaces/roles";
import { apiRequest } from "@/lib/api-client";
import { initials } from "@/lib/format";

interface ShareDialogProps {
  documentId: string;
  documentTitle: string;
  workspaceName: string;
  /** People the document was shared with directly, loaded on the server. */
  permissions: DocumentPermissionSummary[];
  currentUserId: string;
  /**
   * Whether to show the controls for managing access. Purely presentational:
   * the API rejects every sharing request from someone who is not an owner.
   */
  canManage: boolean;
}

const ROLES = documentRoleSchema.options;

/**
 * Shows who a document is shared with. Owners can also share it with more
 * people, change roles and remove people; everyone else sees a read-only list.
 *
 * Every change is sent to the API and the list is then reloaded from the
 * server (`router.refresh()`), so the dialog always shows what is stored.
 */
export function ShareDialog({
  documentId,
  documentTitle,
  workspaceName,
  permissions,
  currentUserId,
  canManage,
}: ShareDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  /** User id of the row with a request in flight. */
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function changeRole(permission: DocumentPermissionSummary, role: DocumentRole) {
    setBusyUserId(permission.userId);
    setError(null);
    const result = await apiRequest(
      "PATCH",
      `/documents/${documentId}/permissions/${permission.userId}`,
      { body: { role }, schema: documentPermissionResponseSchema },
    );
    setBusyUserId(null);
    if (result.ok) {
      setStatus(`${permission.name} is now ${DOCUMENT_ROLE_LABELS[role].toLowerCase()}.`);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  async function remove(permission: DocumentPermissionSummary) {
    setBusyUserId(permission.userId);
    setError(null);
    const result = await apiRequest(
      "DELETE",
      `/documents/${documentId}/permissions/${permission.userId}`,
    );
    setBusyUserId(null);
    if (result.ok) {
      setStatus(`${permission.name} no longer has direct access.`);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <Dialog
      onOpenChange={() => {
        setError(null);
        setStatus(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {canManage ? <UserPlusIcon aria-hidden /> : <UsersIcon aria-hidden />}
          {canManage ? "Share" : "People"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{canManage ? `Share “${documentTitle}”` : "People with access"}</DialogTitle>
          <DialogDescription>
            {canManage
              ? "Give registered SyncSpace users access to this document by email."
              : "Only owners of this document can change who has access."}
          </DialogDescription>
        </DialogHeader>

        {canManage ? (
          <ShareForm
            documentId={documentId}
            onShared={(name, role) => {
              setStatus(`Shared with ${name} as ${DOCUMENT_ROLE_LABELS[role].toLowerCase()}.`);
              router.refresh();
            }}
          />
        ) : null}

        <FormError message={error} />
        <p role="status" className="min-h-5 text-sm text-muted-foreground">
          {status}
        </p>

        <section aria-labelledby="collaborators-heading" className="space-y-3">
          <h3 id="collaborators-heading" className="text-sm font-medium">
            Shared with
          </h3>
          <ul className="max-h-64 divide-y overflow-y-auto">
            {permissions.map((permission) => {
              const isCurrentUser = permission.userId === currentUserId;
              const editable = canManage && !isCurrentUser;
              return (
                <li key={permission.userId} className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                  >
                    {initials(permission.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {permission.name}
                      {isCurrentUser ? (
                        <span className="font-normal text-muted-foreground"> (you)</span>
                      ) : null}
                    </p>
                    {permission.email ? (
                      <p className="truncate text-xs text-muted-foreground">{permission.email}</p>
                    ) : null}
                  </div>
                  {editable ? (
                    <>
                      <RoleSelect
                        label={`Role of ${permission.name}`}
                        value={permission.role}
                        disabled={busyUserId === permission.userId}
                        onChange={(role) => changeRole(permission, role)}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${permission.name}`}
                        disabled={busyUserId === permission.userId}
                        onClick={() => remove(permission)}
                      >
                        <XIcon aria-hidden />
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary">{DOCUMENT_ROLE_LABELS[permission.role]}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Members of the “{workspaceName}” workspace also have access through their workspace
            role. Sharing can add to that access but never reduce it.
          </p>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function RoleSelect({
  label,
  value,
  disabled,
  onChange,
  id,
}: {
  label?: string;
  value: DocumentRole;
  disabled?: boolean;
  onChange: (role: DocumentRole) => void;
  id?: string;
}) {
  return (
    // A native select: fully keyboard accessible and familiar on every device.
    <select
      id={id}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(documentRoleSchema.parse(event.target.value))}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
    >
      {ROLES.map((role) => (
        <option key={role} value={role} title={DOCUMENT_ROLE_DESCRIPTIONS[role]}>
          {DOCUMENT_ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

function ShareForm({
  documentId,
  onShared,
}: {
  documentId: string;
  onShared: (name: string, role: DocumentRole) => void;
}) {
  const roleId = useId();
  const [role, setRole] = useState<DocumentRole>("EDITOR");
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setFormError(null);

    const parsed = shareDocumentRequestSchema.safeParse({
      email: new FormData(form).get("email"),
      role,
    });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message);
      return;
    }
    setEmailError(undefined);

    setPending(true);
    const result = await apiRequest("POST", `/documents/${documentId}/permissions`, {
      body: parsed.data,
      schema: documentPermissionResponseSchema,
    });
    setPending(false);

    if (result.ok) {
      form.reset();
      onShared(result.data.permission.name, result.data.permission.role);
    } else {
      setEmailError(result.fieldErrors.email);
      setFormError(result.fieldErrors.email ? null : result.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-3">
      <FormError message={formError} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-start">
        <FormField
          id="share-email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="off"
          placeholder="name@example.com"
          required
          error={emailError}
        />
        <div className="grid gap-2">
          <Label htmlFor={roleId}>Role</Label>
          <RoleSelect id={roleId} value={role} onChange={setRole} disabled={pending} />
        </div>
        <Button type="submit" disabled={pending} aria-busy={pending} className="sm:mt-[1.375rem]">
          {pending ? "Sharing…" : "Share"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{DOCUMENT_ROLE_DESCRIPTIONS[role]}.</p>
    </form>
  );
}
