import type { AuthConfig } from "convex/server";
import { DEMO_AUDIENCE, DEMO_ISSUER } from "../shared/demo";

// Convex requires every variable read here to be set on the deployment, so set all three:
// - CLERK_JWT_ISSUER_DOMAIN: the Clerk Frontend API URL (ADR-002), or "disabled" on demo-only
//   deployments. Also activate the Convex integration in the Clerk dashboard.
// - DEMO_MODE: "false" on production. "true" enables the 8 demo profiles (non-production only).
// - DEMO_JWKS: data: URI with the demo public key (`npm run demo:setup`), or "none".
const providers: AuthConfig["providers"] = [];

const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;
if (clerkDomain && clerkDomain !== "disabled") {
  providers.push({ domain: clerkDomain, applicationID: "convex" });
}

const demoJwks = process.env.DEMO_JWKS;
if (process.env.DEMO_MODE === "true" && demoJwks?.startsWith("data:")) {
  providers.push({
    type: "customJwt",
    issuer: DEMO_ISSUER,
    applicationID: DEMO_AUDIENCE,
    jwks: demoJwks,
    algorithm: "RS256",
  });
}

export default { providers } satisfies AuthConfig;
