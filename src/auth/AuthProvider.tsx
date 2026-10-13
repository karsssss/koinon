import { ClerkProvider, SignIn, SignOutButton, useAuth } from "@clerk/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { Screen } from "@/components/Card";
import { Button } from "@/components/ui/button";
import { AuthUiContext } from "./context";
import { DemoAuthProvider } from "./demo";

const mode = import.meta.env.VITE_AUTH_MODE === "demo" ? "demo" : "clerk";

function ClerkSignInScreen() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-2xl font-semibold">Koinon</h1>
        {/* Email-code sign-in only (ADR-002); configure the strategies in the Clerk dashboard. */}
        <SignIn routing="hash" />
      </div>
    </main>
  );
}

function ClerkSignOut() {
  return (
    <SignOutButton>
      <Button variant="ghost" size="sm">
        Sign out
      </Button>
    </SignOutButton>
  );
}

const clerkAppearance = {
  variables: {
    colorPrimary: "oklch(0.82 0.13 85)",
    colorBackground: "oklch(0.185 0.006 270)",
    colorText: "oklch(0.96 0.003 270)",
    colorTextSecondary: "oklch(0.72 0.01 270)",
    colorInputBackground: "oklch(0.225 0.007 270)",
    colorInputText: "oklch(0.96 0.003 270)",
  },
};

export function AuthProvider({ convex, children }: { convex: ConvexReactClient; children: ReactNode }) {
  if (mode === "demo") return <DemoAuthProvider convex={convex}>{children}</DemoAuthProvider>;

  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
  if (!publishableKey) {
    return (
      <Screen title="Sign-in is not configured">
        Set <code>VITE_CLERK_PUBLISHABLE_KEY</code>, or use <code>VITE_AUTH_MODE=demo</code> on a non-production deployment.
      </Screen>
    );
  }
  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/" appearance={clerkAppearance}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <AuthUiContext.Provider value={{ mode: "clerk", SignInScreen: ClerkSignInScreen, SignOut: ClerkSignOut }}>{children}</AuthUiContext.Provider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
