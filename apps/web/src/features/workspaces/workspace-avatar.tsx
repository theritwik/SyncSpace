import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

// Full class names so Tailwind can see them at build time.
const COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-violet-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-700",
  "bg-slate-600",
];

/** Stable colour per workspace, derived from its slug. */
function colorFor(slug: string): string {
  let hash = 0;
  for (const character of slug) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return COLORS[hash % COLORS.length] ?? "bg-slate-600";
}

interface WorkspaceAvatarProps {
  name: string;
  slug: string;
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: "size-6 rounded-md text-[0.625rem]",
  md: "size-9 rounded-lg text-sm",
  lg: "size-12 rounded-xl text-lg",
};

/** Decorative: always shown next to the workspace name, so it is hidden from screen readers. */
export function WorkspaceAvatar({ name, slug, size = "md" }: WorkspaceAvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold text-white select-none",
        SIZES[size],
        colorFor(slug),
      )}
    >
      {initials(name).slice(0, size === "sm" ? 1 : 2)}
    </span>
  );
}
