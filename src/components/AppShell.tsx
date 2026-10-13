import { House, Wallet } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import { useAuthUi } from "@/auth/context";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";

const NAV = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/wallet", label: "Wallet", icon: Wallet, end: false },
] as const;

interface Me {
  readonly displayName: string;
  readonly avatar: string;
}

/** Mobile: top bar + bottom tab bar. Desktop (≥1024px): side nav (DESIGN.md §4). */
export function AppShell({ me }: { me: Me }) {
  const { SignOut, mode } = useAuthUi();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>

      <aside className="hidden border-r lg:flex lg:flex-col lg:gap-6 lg:p-5">
        <div className="text-lg font-semibold tracking-tight">Koinon</div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn("flex h-11 items-center gap-3 rounded-md px-3 text-muted-foreground hover:bg-accent hover:text-foreground", isActive && "bg-accent text-foreground")
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur pt-[env(safe-area-inset-top)] lg:px-8">
          <span className="text-lg font-semibold tracking-tight lg:hidden">Koinon</span>
          {mode === "demo" && <span className="rounded-sm bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">Demo</span>}
          <div className="ml-auto flex items-center gap-2">
            <Avatar emoji={me.avatar} className="size-8 text-base" />
            <span className="max-w-[8rem] truncate text-sm" data-testid="current-member">
              {me.displayName}
            </span>
            <SignOut />
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 outline-none lg:px-8 lg:pb-10">
          <Outlet />
        </main>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-2 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn("flex h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground", isActive && "text-primary")}
            >
              <Icon className="size-6" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
