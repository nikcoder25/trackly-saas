/**
 * Cluster mode wrapper — runs server.js across multiple CPU cores.
 *
 * Usage:
 *   node cluster.js          # auto-detect CPU count
 *   CLUSTER_WORKERS=4 node cluster.js  # fixed worker count
 *   node server.js           # single-process mode (unchanged, for dev)
 *
 * Benefits at scale (10K+ DAU):
 *   - Spreads HTTP/SSE connections across workers → no single-process bottleneck
 *   - Automatic restart on worker crash
 *   - Cron jobs run only on primary → no duplicate scheduled runs
 *
 * Note: In-memory caches (response cache, brand locks, rate-limit queues)
 *       are per-worker. The PostgreSQL advisory locks and DB-backed cache
 *       already handle cross-instance coordination.
 */
const cluster = require('cluster');
const os = require('os');

const WORKER_COUNT = parseInt(process.env.CLUSTER_WORKERS, 10) || os.cpus().length;

if (cluster.isPrimary) {
  console.log(`[Cluster] Primary ${process.pid} starting ${WORKER_COUNT} workers...`);

  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Cluster] Worker ${worker.process.pid} exited (code=${code}, signal=${signal}). Restarting...`);
    cluster.fork();
  });

  // Graceful shutdown — forward signals to all workers
  const shutdown = (signal) => {
    console.log(`[Cluster] ${signal} received. Shutting down workers...`);
    for (const id in cluster.workers) {
      cluster.workers[id].process.kill(signal);
    }
    // Give workers time to shut down, then exit primary
    setTimeout(() => process.exit(0), 15000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} else {
  // Workers run the actual server
  // Set WORKER_ID env so server.js can skip cron on non-primary workers
  process.env.CLUSTER_WORKER_ID = cluster.worker.id.toString();
  require('./server');
}
