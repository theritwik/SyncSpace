import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

export interface Breadcrumb {
  label: string;
  /** Omit for the current page (the last item). */
  href?: string;
}

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <ChevronRightIcon aria-hidden className="size-3.5 shrink-0" /> : null}
            {item.href ? (
              <Link
                href={item.href}
                className="max-w-40 truncate rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="max-w-56 truncate text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
