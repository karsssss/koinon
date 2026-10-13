import { httpRouter } from "convex/server";
import { DEMO_AUDIENCE, DEMO_ISSUER, DEMO_PROFILES } from "../shared/demo";
import { httpAction } from "./_generated/server";

const http = httpRouter();

// ---- Demo sign-in (NON-PRODUCTION) ----
// Issues short-lived RS256 tokens for the 8 demo profiles, only when DEMO_MODE=true.
// Demo tokens use their own issuer, so they can only ever map to demo members.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const encodeJson = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));

async function signDemoToken(subject: string, email: string, name: string): Promise<string> {
  const jwk = JSON.parse(process.env.DEMO_JWT_PRIVATE_KEY ?? "null") as JsonWebKey | null;
  if (jwk === null) throw new Error("DEMO_JWT_PRIVATE_KEY is not set");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT", kid: "demo-1" })}.${encodeJson({
    iss: DEMO_ISSUER,
    aud: DEMO_AUDIENCE,
    sub: subject,
    iat,
    exp: iat + 60 * 60,
    email,
    email_verified: true,
    name,
  })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

http.route({
  path: "/demo-auth/token",
  method: "POST",
  handler: httpAction(async (_ctx, request) => {
    if (process.env.DEMO_MODE !== "true") return new Response("Not found", { status: 404 });
    const body = (await request.json().catch(() => null)) as { subject?: unknown } | null;
    const profile = DEMO_PROFILES.find((p) => p.subject === body?.subject);
    if (!profile) return new Response("Unknown demo profile", { status: 400, headers: cors });
    const token = await signDemoToken(profile.subject, profile.email, profile.displayName);
    return Response.json({ token }, { headers: cors });
  }),
});

http.route({
  path: "/demo-auth/token",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: process.env.DEMO_MODE === "true" ? 204 : 404, headers: cors })),
});

export default http;
