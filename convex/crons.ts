import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("refresh availability at midnight", { hourUTC: 0, minuteUTC: 0 }, internal.automation.updateBoardClock);
export default crons;
