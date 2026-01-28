const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const http = require("http");
const WebSocket = require("ws");
const pino = require("pino");
const pinoHttp = require("pino-http");

const { loadConfig } = require("./config");
const { createOctokit, fetchRepoBundle } = require("./github");
const { createRedis, cacheGetJson, cacheSetJson } = require("./cache");
const { createDb, insertSnapshot, getLatestSnapshot } = require("./db");
const { createMetrics } = require("./metrics");
const { computeHealthScore } = require("./healthScore");
const { nowIso, sleep } = require("./utils");

function makeCacheKey(fullName) {
  return `aegis:repo:${fullName}`;
}

async function buildRepoView({ pool, redis, octokit, cfg, metrics, logger }, repoRef) {
  const fullName = repoRef.full_name;
  const cacheKey = makeCacheKey(fullName);

  const cached = await cacheGetJson(redis, cacheKey);
  if (cached) return cached;

  const end = metrics.repoFetchDuration.startTimer({ full_name: fullName });
  try {
    const bundle = await fetchRepoBundle(octokit, repoRef.owner, repoRef.repo);
    const health = computeHealthScore(bundle);
    const view = {
      ...bundle,
      health,
      fetched_at: nowIso()
    };

    await cacheSetJson(redis, cacheKey, view, cfg.CACHE_TTL_SECONDS);
    await insertSnapshot(pool, fullName, view);

    metrics.repoFetchTotal.inc({ full_name: fullName, result: "ok" }, 1);
    end({ result: "ok" });
    return view;
  } catch (err) {
    metrics.repoFetchTotal.inc({ full_name: fullName, result: "error" }, 1);
    end({ result: "error" });

    logger.warn({ err: String(err), fullName }, "GitHub fetch failed, falling back to latest snapshot");

    const latest = await getLatestSnapshot(pool, fullName);
    if (latest?.data) {
      const fallback = {
        ...latest.data,
        fetched_at: latest.fetched_at,
        stale: true,
        error: "GitHub fetch failed; showing last known data"
      };
      await cacheSetJson(redis, cacheKey, fallback, Math.max(cfg.CACHE_TTL_SECONDS, 10));
      return fallback;
    }

    return {
      full_name: fullName,
      fetched_at: nowIso(),
      stale: true,
      error: "GitHub fetch failed and no snapshot exists yet"
    };
  }
}

function broadcastJson(wss, payload) {
  const msg = JSON.stringify(payload);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

async function main() {
  const cfg = loadConfig(process.env);

  const logger = pino({ level: cfg.LOG_LEVEL });
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: cfg.CORS_ORIGIN,
      credentials: false
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === "/metrics" }
    })
  );

  const pool = createDb(cfg.DATABASE_URL);
  const redis = createRedis(cfg.REDIS_URL);
  const octokit = createOctokit(cfg.GITHUB_TOKEN);
  const metrics = createMetrics();

  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    metrics.wsClients.set(wss.clients.size);

    ws.send(
      JSON.stringify({
        type: "hello",
        ts: nowIso(),
        repos: cfg.repos.map(r => r.full_name)
      })
    );

    ws.on("close", () => metrics.wsClients.set(wss.clients.size));
    ws.on("error", () => {});
  });

  app.get("/api/health", async (req, res) => {
    try {
      const pgOk = await pool.query("SELECT 1 as ok");
      const redisOk = await redis.ping();
      res.json({
        status: "ok",
        services: {
          postgres: !!pgOk.rows?.[0]?.ok,
          redis: redisOk === "PONG"
        },
        ts: nowIso(),
        repos: cfg.repos.map(r => r.full_name)
      });
    } catch (err) {
      res.status(503).json({ status: "degraded", error: String(err), ts: nowIso() });
    }
  });

  app.get("/api/repos", async (req, res) => {
    const results = await Promise.all(cfg.repos.map(r => buildRepoView({ pool, redis, octokit, cfg, metrics, logger }, r)));
    res.json({ ts: nowIso(), count: results.length, repos: results });
  });

  app.get("/api/repos/:owner/:repo", async (req, res) => {
    const { owner, repo } = req.params;
    const fullName = `${owner}/${repo}`;

    const repoRef = { owner, repo, full_name: fullName };
    const view = await buildRepoView({ pool, redis, octokit, cfg, metrics, logger }, repoRef);
    res.json(view);
  });

  app.get("/metrics", async (req, res) => {
    res.set("Content-Type", metrics.client.register.contentType);
    res.end(await metrics.client.register.metrics());
  });

  async function pollLoop() {
    while (true) {
      const started = Date.now();
      const payload = { type: "tick", ts: nowIso(), repos: [] };

      for (const r of cfg.repos) {
        const view = await buildRepoView({ pool, redis, octokit, cfg, metrics, logger }, r);
        payload.repos.push(view);
        broadcastJson(wss, { type: "repo:update", ts: nowIso(), repo: view });
      }

      broadcastJson(wss, payload);

      const elapsed = Date.now() - started;
      const wait = Math.max(1000, cfg.POLL_INTERVAL_MS - elapsed);
      await sleep(wait);
    }
  }

  server.listen(cfg.PORT, () => {
    logger.info({ port: cfg.PORT, repos: cfg.repos.map(r => r.full_name) }, "AEGIS backend listening");
  });

  pollLoop().catch((err) => logger.error({ err: String(err) }, "pollLoop crashed"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
