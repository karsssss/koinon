import { Component, type ReactNode } from "react";
import { errorMessage } from "@/lib/errors";
import { Screen } from "./Card";
import { Button } from "./ui/button";

/** Catches query errors (e.g. a session that lost access) and offers a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <Screen title="Something went wrong">
        <p>{errorMessage(this.state.error)}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Screen>
    );
  }
}
