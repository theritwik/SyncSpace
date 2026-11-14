import { Badge } from "@/components/ui/badge";

import { getApiHealth } from "./get-api-health";

export async function SystemStatus() {
  const result = await getApiHealth();

  const apiUp = result.reachable;
  const databaseUp = result.reachable && result.health.checks.database === "up";

  return (
    <dl className="divide-y">
      <StatusRow label="API" up={apiUp} upText="Operational" downText="Unreachable" />
      <StatusRow
        label="Database"
        up={databaseUp}
        upText="Connected"
        downText={apiUp ? "Unavailable" : "Unknown"}
      />
    </dl>
  );
}

export function SystemStatusFallback() {
  return <p className="py-3 text-sm text-muted-foreground">Checking services…</p>;
}

function StatusRow({
  label,
  up,
  upText,
  downText,
}: {
  label: string;
  up: boolean;
  upText: string;
  downText: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <dt className="font-medium">{label}</dt>
      <dd>
        <Badge variant={up ? "secondary" : "destructive"}>
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${up ? "bg-emerald-500" : "bg-white"}`}
          />
          {up ? upText : downText}
        </Badge>
      </dd>
    </div>
  );
}
