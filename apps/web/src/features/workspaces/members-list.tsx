import type { WorkspaceMemberSummary } from "@syncspace/shared";

import { Badge } from "@/components/ui/badge";
import { formatDate, initials } from "@/lib/format";

import { ROLE_LABELS } from "./roles";

interface MembersListProps {
  members: WorkspaceMemberSummary[];
  currentUserId: string;
}

export function MembersList({ members, currentUserId }: MembersListProps) {
  return (
    <ul className="divide-y">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
          >
            {initials(member.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {member.name}
              {member.userId === currentUserId ? (
                <span className="font-normal text-muted-foreground"> (you)</span>
              ) : null}
            </p>
            <p className="truncate text-sm text-muted-foreground">{member.email}</p>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Joined {formatDate(member.joinedAt)}
          </p>
          <Badge variant={member.role === "OWNER" ? "default" : "secondary"}>
            {ROLE_LABELS[member.role]}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
