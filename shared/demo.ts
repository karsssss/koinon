// Eight demo profiles for NON-PRODUCTION environments only (DEMO_MODE=true on the deployment).
// Demo identities come from a separate JWT issuer, so they can never match a real Clerk user.

export const DEMO_ISSUER = "https://demo-auth.koinon.invalid";
export const DEMO_AUDIENCE = "koinon-demo";

export interface DemoProfile {
  readonly subject: string;
  readonly displayName: string;
  readonly avatar: string;
  readonly email: string;
  readonly role: "admin" | "member";
}

export const DEMO_PROFILES: readonly DemoProfile[] = [
  { subject: "demo-1", displayName: "Ada", avatar: "🦊", email: "ada@demo.koinon.invalid", role: "admin" },
  { subject: "demo-2", displayName: "Bo", avatar: "🐙", email: "bo@demo.koinon.invalid", role: "member" },
  { subject: "demo-3", displayName: "Cy", avatar: "🦉", email: "cy@demo.koinon.invalid", role: "member" },
  { subject: "demo-4", displayName: "Dee", avatar: "🐢", email: "dee@demo.koinon.invalid", role: "member" },
  { subject: "demo-5", displayName: "Eli", avatar: "🦄", email: "eli@demo.koinon.invalid", role: "member" },
  { subject: "demo-6", displayName: "Fen", avatar: "🐝", email: "fen@demo.koinon.invalid", role: "member" },
  { subject: "demo-7", displayName: "Gus", avatar: "🐳", email: "gus@demo.koinon.invalid", role: "member" },
  { subject: "demo-8", displayName: "Hal", avatar: "🦔", email: "hal@demo.koinon.invalid", role: "member" },
];

/** Convex builds tokenIdentifier as `${issuer}|${subject}`. */
export function demoTokenIdentifier(subject: string): string {
  return `${DEMO_ISSUER}|${subject}`;
}
