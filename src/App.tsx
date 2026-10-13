import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { api } from "../convex/_generated/api";
import { useAuthUi } from "./auth/context";
import { AppShell } from "./components/AppShell";
import { Screen } from "./components/Card";
import { HomePage } from "./features/home/HomePage";
import { WalletPage } from "./features/wallet/WalletPage";
import { errorMessage } from "./lib/errors";

function Activate() {
  const activate = useMutation(api.members.activate);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    activate({}).catch((e: unknown) => setError(errorMessage(e)));
  }, [activate]);
  return <Screen title={error ? "Couldn't join the group" : "Joining the group…"}>{error}</Screen>;
}

function MemberGate() {
  const session = useQuery(api.members.session);
  const { SignOut } = useAuthUi();
  if (session === undefined) return <Screen title="Loading…" />;
  if (session.status === "invited") return <Activate />;
  if (session.status !== "member") {
    return (
      <Screen title={session.status === "frozen" ? "Your account is paused" : "This is a private group"}>
        <p>{session.status === "frozen" ? "Ask the group admin to restore access." : "Sign-in works only for invited members."}</p>
        <div className="mt-4">
          <SignOut />
        </div>
      </Screen>
    );
  }
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell me={session.member} />}>
          <Route index element={<HomePage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export function App() {
  const { SignInScreen } = useAuthUi();
  return (
    <>
      <AuthLoading>
        <Screen title="Loading…" />
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen />
      </Unauthenticated>
      <Authenticated>
        <MemberGate />
      </Authenticated>
    </>
  );
}
