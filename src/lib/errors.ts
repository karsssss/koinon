import { ConvexError } from "convex/values";

const MESSAGES: Record<string, string> = {
  INSUFFICIENT_FUNDS: "You don't have enough coins for that.",
  IDEMPOTENCY_CONFLICT: "That request was already sent with different details. Close and try again.",
  NOT_A_MEMBER: "This is a private group.",
  UNAUTHENTICATED: "Your session ended. Sign in again.",
};

/** A user-facing message for a failed Convex call. */
export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) {
    const data = e.data as { code?: string; message?: string };
    return (data.code && MESSAGES[data.code]) ?? data.message ?? "Something went wrong.";
  }
  return "Couldn't reach the server. Check your connection and try again.";
}
