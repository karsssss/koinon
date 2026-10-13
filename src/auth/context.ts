import { createContext, useContext, type ComponentType } from "react";

export interface AuthUi {
  readonly mode: "clerk" | "demo";
  readonly SignInScreen: ComponentType;
  readonly SignOut: ComponentType;
}

export const AuthUiContext = createContext<AuthUi | null>(null);

export function useAuthUi(): AuthUi {
  const ui = useContext(AuthUiContext);
  if (ui === null) throw new Error("useAuthUi must be used inside AuthProvider");
  return ui;
}
