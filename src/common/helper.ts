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

  // CPU time is in microseconds, convert to percentage
  const cpuPercent =
    ((currentCpuUsage.user + currentCpuUsage.system) / 1000 / elapsedMs) * 100;
  STATS.cpu = Math.round(cpuPercent * 100) / 100;

  prevCpuUsage = process.cpuUsage();
  prevTime = currentTime;
}

// Auto-start stats collection
updateStats();
setInterval(updateStats, STATS_INTERVAL_MS);
