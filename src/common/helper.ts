import { STATS_INTERVAL_MS, STATS } from "./const";

let prevCpuUsage = process.cpuUsage();
let prevTime = Date.now();
let nextSampleAt = 0; // 0 => first call always samples

function updateStats(now: number): void {
  // Memory: process RSS in MB
  const memUsage = process.memoryUsage();
  STATS.mem = Math.round(memUsage.rss / 1024 / 1024);

  // CPU: percentage since last sample
  const currentCpuUsage = process.cpuUsage(prevCpuUsage);
  const elapsedMs = now - prevTime;
  const safeElapsedMs = elapsedMs > 0 ? elapsedMs : 1;

  // CPU time is in microseconds, convert to percentage
  const cpuPercent =
    ((currentCpuUsage.user + currentCpuUsage.system) / 1000 / safeElapsedMs) *
    100;
  STATS.cpu = Math.round(cpuPercent * 100) / 100;

  prevCpuUsage = process.cpuUsage();
  prevTime = now;
}

/**
 * Refreshes process stats at most once per STATS_INTERVAL_MS.
 * Called from exec() on the hot path instead of a background timer, so
 * importing this module has no side effects and nothing keeps the event
 * loop alive (serverless-safe).
 */
export function updateStatsIfStale(now: number): void {
  if (now < nextSampleAt) return;
  nextSampleAt = now + STATS_INTERVAL_MS;
  updateStats(now);
}
