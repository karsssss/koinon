import "@fontsource-variable/inter";
import "./styles.css";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) throw new Error("VITE_CONVEX_URL is not set");
const convex = new ConvexReactClient(convexUrl);

const root = document.getElementById("root");
if (root === null) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider convex={convex}>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
