import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ title, action, children, className, labelledBy }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section aria-labelledby={title ? labelledBy : undefined} className={cn("rounded-lg border bg-surface-1 p-4 sm:p-5", className)}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={labelledBy} className="text-sm font-medium text-muted-foreground">
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Full-screen centred message (loading, not invited, configuration errors). */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold">{title}</h1>
        {children && <div className="mt-3 text-muted-foreground">{children}</div>}
      </div>
    </main>
  );
}
