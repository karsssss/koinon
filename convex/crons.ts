import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Crons run in UTC. Off the hour, per Convex guidance.
crons.daily("ledger audit", { hourUTC: 9, minuteUTC: 17 }, internal.ledger.audit.run);

export default crons;
