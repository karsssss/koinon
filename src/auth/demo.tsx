// NON-PRODUCTION demo sign-in for the 8 seeded profiles. Tokens come from the deployment's
// /demo-auth/token HTTP action, which only answers when the backend has DEMO_MODE=true.
// The chosen profile lives in sessionStorage, so each tab or browser context can be a different person.

import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { DEMO_PROFILES } from "../../shared/demo";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { AuthUiContext } from "./context";

const STORAGE_KEY = "koinon.demoSubject";
const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string | undefined;

interface DemoSession {
  readonly subject: string | null;
  readonly signIn: (subject: string) => void;
  readonly signOut: () => void;
}

const DemoSessionContext = createContext<DemoSession | null>(null);

function useDemoSession(): DemoSession {
  const s = useContext(DemoSessionContext);
  if (s === null) throw new Error("DemoSessionContext missing");
  return s;
}

function useDemoConvexAuth() {
  const { subject } = useDemoSession();
  const cache = useRef<{ subject: string; token: string; exp: number } | null>(null);
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (subject === null || !siteUrl) return null;
      const cached = cache.current;
      if (!forceRefreshToken && cached?.subject === subject && cached.exp - 60 > Date.now() / 1000) return cached.token;
      const res = await fetch(`${siteUrl}/demo-auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      if (!res.ok) return null;
      const { token } = (await res.json()) as { token: string };
      const payload = JSON.parse(atob(token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "")) as { exp: number };
      cache.current = { subject, token, exp: payload.exp };
      return token;
    },
    [subject],
  );
  return useMemo(() => ({ isLoading: false, isAuthenticated: subject !== null, fetchAccessToken }), [subject, fetchAccessToken]);
}

function DemoBanner() {
  return (
    <p role="note" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
      Demo environment. Not the real group; data here is reset often.
    </p>
  );
}

function DemoSignInScreen() {
  const { signIn } = useDemoSession();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Koinon</h1>
        <p className="mt-1 text-muted-foreground">Choose a demo profile to sign in.</p>
      </div>
      <DemoBanner />
      <ul className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2" aria-label="Demo profiles">
        {DEMO_PROFILES.map((p) => (
          <li key={p.subject}>
            <Button variant="outline" className="h-14 w-full justify-start gap-3" onClick={() => signIn(p.subject)}>
              <Avatar emoji={p.avatar} className="size-8 text-lg" />
              <span>{p.displayName}</span>
              {p.role === "admin" && <span className="ml-auto text-xs text-muted-foreground">admin</span>}
            </Button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function DemoSignOut() {
  const { signOut } = useDemoSession();
  return (
    <Button variant="ghost" size="sm" onClick={signOut}>
      Sign out
    </Button>
  );
}

export function DemoAuthProvider({ convex, children }: { convex: ConvexReactClient; children: ReactNode }) {
  const [subject, setSubject] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const session = useMemo<DemoSession>(
    () => ({
      subject,
      signIn: (s) => {
        sessionStorage.setItem(STORAGE_KEY, s);
        setSubject(s);
      },
      signOut: () => {
        sessionStorage.removeItem(STORAGE_KEY);
        setSubject(null);
      },
    }),
    [subject],
  );
  return (
    <DemoSessionContext.Provider value={session}>
      <ConvexProviderWithAuth client={convex} useAuth={useDemoConvexAuth}>
        <AuthUiContext.Provider value={{ mode: "demo", SignInScreen: DemoSignInScreen, SignOut: DemoSignOut }}>{children}</AuthUiContext.Provider>
      </ConvexProviderWithAuth>
    </DemoSessionContext.Provider>
  );
}
