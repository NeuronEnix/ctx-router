import { STATS_INTERVAL_MS, STATS } from "./const";

let prevCpuUsage = process.cpuUsage();
let prevTime = Date.now();

function updateStats(): void {
  // Memory: process RSS in MB
  const memUsage = process.memoryUsage();
  STATS.mem = Math.round(memUsage.rss / 1024 / 1024);

  // CPU: percentage since last check
  const currentCpuUsage = process.cpuUsage(prevCpuUsage);
  const currentTime = Date.now();
  const elapsedMs = currentTime - prevTime;
  const safeElapsedMs = elapsedMs > 0 ? elapsedMs : 1;

  // CPU time is in microseconds, convert to percentage
  const cpuPercent =
    ((currentCpuUsage.user + currentCpuUsage.system) / 1000 / safeElapsedMs) *
    100;
  STATS.cpu = Math.round(cpuPercent * 100) / 100;

  prevCpuUsage = process.cpuUsage();
  prevTime = currentTime;
}

/**
 * Schedules recurring stats updates with self-rescheduling setTimeout.
 * Timer is unref'ed so it does not keep serverless runtimes alive.
 */
function scheduleStatsUpdate(): void {
  updateStats();
  setTimeout(scheduleStatsUpdate, STATS_INTERVAL_MS);
}

scheduleStatsUpdate();
