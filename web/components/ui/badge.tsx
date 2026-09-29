import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-muted-foreground",
        accent:
          "border-[color-mix(in_srgb,var(--emerald)_50%,transparent)] bg-[color-mix(in_srgb,var(--emerald)_14%,transparent)] text-[var(--emerald-bright)]",
        gold: "border-[color-mix(in_srgb,var(--gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] text-[var(--gold-bright)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
