/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bets from "../bets.js";
import type * as crons from "../crons.js";
import type * as daily from "../daily.js";
import type * as demo from "../demo.js";
import type * as feed from "../feed.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as ledger_audit from "../ledger/audit.js";
import type * as ledger_post from "../ledger/post.js";
import type * as lib_auth from "../lib/auth.js";
import type * as members from "../members.js";
import type * as model_members from "../model/members.js";
import type * as setup from "../setup.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bets: typeof bets;
  crons: typeof crons;
  daily: typeof daily;
  demo: typeof demo;
  feed: typeof feed;
  http: typeof http;
  invites: typeof invites;
  "ledger/audit": typeof ledger_audit;
  "ledger/post": typeof ledger_post;
  "lib/auth": typeof lib_auth;
  members: typeof members;
  "model/members": typeof model_members;
  setup: typeof setup;
  wallet: typeof wallet;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
