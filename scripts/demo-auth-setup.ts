// Configures demo sign-in on the CURRENT Convex deployment (local/dev only; never production):
// generates an RS256 key pair, sets DEMO_MODE, DEMO_JWT_PRIVATE_KEY and DEMO_JWKS (data: URI),
// pushes functions so auth.config.ts picks them up, then resets the demo data.
//   npm run demo:setup

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const envLocal = readFileSync(".env.local", "utf8");
if (/^CONVEX_DEPLOYMENT=prod:/m.test(envLocal)) throw new Error("Refusing to enable demo sign-in on a production deployment.");

const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
const publicJwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "demo-1", alg: "RS256", use: "sig" };
const jwks = `data:text/plain;charset=utf-8;base64,${Buffer.from(JSON.stringify({ keys: [publicJwk] })).toString("base64")}`;

const current = (name: string): string => {
  try {
    return execSync(`npx convex env get ${name}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
// Keep a real Clerk domain if one is configured; otherwise mark Clerk as disabled for this deployment.
const clerkDomain = current("CLERK_JWT_ISSUER_DOMAIN") || "disabled";

mkdirSync(".convex", { recursive: true });
const file = ".convex/demo-auth.env";
writeFileSync(file, [`CLERK_JWT_ISSUER_DOMAIN=${clerkDomain}`, `DEMO_MODE=true`, `DEMO_JWT_PRIVATE_KEY='${JSON.stringify(privateJwk)}'`, `DEMO_JWKS=${jwks}`, ""].join("\n"));

const run = (cmd: string) => execSync(cmd, { stdio: "inherit" });
run(`npx convex env set --force --from-file ${file}`);
run("npx convex dev --once");
// On Windows the Convex CLI can abort with a libuv assertion (0xC0000409) *after* the function
// has run, so judge `convex run` by its output rather than its exit status.
let output: string;
try {
  output = execSync("npx convex run demo:reset", { encoding: "utf8" });
} catch (e) {
  output = String((e as { stdout?: unknown }).stdout ?? "");
}
if (!output.includes('"created"')) throw new Error(`demo:reset failed:
${output}`);
console.log(output.trim());
console.log("Demo sign-in ready. Set VITE_AUTH_MODE=demo in .env.local and run `npm run dev`.");
