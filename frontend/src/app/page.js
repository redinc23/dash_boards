"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { backendWs, fetchHealth, fetchRepos } from "../lib/api";

function badge(score) {
  if (score >= 85) return "✅ Healthy";
  if (score >= 65) return "🟡 Watch";
  return "🔴 Risk";
}

function formatMaybeDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function Page() {
  const [health, setHealth] = useState(null);
  const [repos, setRepos] = useState([]);
  const [status, setStatus] = useState({ ws: "disconnected", lastTick: null, error: null });
  const [loading, setLoading] = useState(true);

  const wsRef = useRef(null);
  const repoMap = useMemo(() => {
    const m = new Map();
    for (const r of repos) m.set(r.full_name, r);
    return m;
  }, [repos]);

  async function refreshHttp() {
    try {
      const [h, r] = await Promise.all([fetchHealth(), fetchRepos()]);
      setHealth(h);
      setRepos(r.repos || []);
      setStatus((s) => ({ ...s, error: null }));
    } catch (e) {
      setStatus((s) => ({ ...s, error: String(e?.message || e) }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshHttp();
    const id = setInterval(refreshHttp, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const url = `${backendWs()}/ws`;
    let ws;
    let stopped = false;

    function connect() {
      if (stopped) return;

      setStatus((s) => ({ ...s, ws: "connecting" }));
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setStatus((s) => ({ ...s, ws: "connected", error: null }));
      ws.onclose = () => {
        setStatus((s) => ({ ...s, ws: "disconnected" }));
        if (!stopped) setTimeout(connect, 1500);
      };
      ws.onerror = () => {};

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "tick") {
            setStatus((s) => ({ ...s, lastTick: msg.ts }));
          }
          if (msg.type === "repo:update" && msg.repo?.full_name) {
            const updated = msg.repo;
            setRepos((prev) => {
              const next = prev.filter((p) => p.full_name !== updated.full_name);
              next.push(updated);
              next.sort((a, b) => a.full_name.localeCompare(b.full_name));
              return next;
            });
          }
        } catch {
          // ignore
        }
      };
    }

    connect();
    return () => {
      stopped = true;
      try { ws?.close(); } catch {}
    };
  }, []);

  const sortedRepos = useMemo(() => {
    const arr = [...repos];
    arr.sort((a, b) => (b.health?.score || 0) - (a.health?.score || 0));
    return arr;
  }, [repos]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">AEGIS Monitoring</h1>
          <p className="text-sm text-zinc-400">
            Auto-refresh: 30s • WS: <span className="text-zinc-200">{status.ws}</span>
            {status.lastTick ? <> • Last tick: <span className="text-zinc-200">{formatMaybeDate(status.lastTick)}</span></> : null}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={refreshHttp}
            className="rounded-xl bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 active:bg-zinc-800"
          >
            Refresh now
          </button>
          <a
            href={`${process.env.NEXT_PUBLIC_BACKEND_HTTP || "http://localhost:3001"}/api/health`}
            target="_blank"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800"
            rel="noreferrer"
          >
            API health
          </a>
        </div>
      </header>

      {status.error ? (
        <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-200">
          {status.error}
        </div>
      ) : null}

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-zinc-900 p-4 shadow">
          <div className="text-sm text-zinc-400">API</div>
          <div className="mt-1 text-lg">{health?.status || (loading ? "Loading..." : "—")}</div>
          <div className="mt-2 text-xs text-zinc-500">
            Postgres: {String(health?.services?.postgres ?? "—")} • Redis: {String(health?.services?.redis ?? "—")}
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900 p-4 shadow">
          <div className="text-sm text-zinc-400">Repos monitored</div>
          <div className="mt-1 text-lg">{sortedRepos.length}</div>
          <div className="mt-2 text-xs text-zinc-500">
            From env <span className="text-zinc-300">REPOS</span>
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900 p-4 shadow">
          <div className="text-sm text-zinc-400">Average health</div>
          <div className="mt-1 text-lg">
            {sortedRepos.length
              ? Math.round(sortedRepos.reduce((a, r) => a + (r.health?.score || 0), 0) / sortedRepos.length)
              : "—"}
          </div>
          <div className="mt-2 text-xs text-zinc-500">
            Based on activity + issues + CI
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Repositories</h2>
          <div className="text-xs text-zinc-500">
            Prometheus: <a className="underline hover:text-zinc-300" href="http://localhost:9090" target="_blank" rel="noreferrer">9090</a>{" "}
            • Grafana: <a className="underline hover:text-zinc-300" href="http://localhost:3002" target="_blank" rel="noreferrer">3002</a>
          </div>
        </div>

        <div className="mt-3 grid gap-4">
          {sortedRepos.map((r) => (
            <div key={r.full_name} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {r.owner?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.owner.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                    ) : null}
                    <a
                      className="truncate text-base font-semibold hover:underline"
                      href={r.html_url || "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {r.full_name}
                    </a>
                    {r.private ? (
                      <span className="rounded-lg bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">private</span>
                    ) : (
                      <span className="rounded-lg bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">public</span>
                    )}
                    {r.stale ? (
                      <span className="rounded-lg bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-200">stale</span>
                    ) : null}
                  </div>

                  <div className="mt-1 text-sm text-zinc-400">{r.description || "—"}</div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-300">
                    <span className="rounded-lg bg-zinc-900 px-2 py-1">⭐ {r.stargazers_count ?? "—"}</span>
                    <span className="rounded-lg bg-zinc-900 px-2 py-1">🍴 {r.forks_count ?? "—"}</span>
                    <span className="rounded-lg bg-zinc-900 px-2 py-1">🐛 {r.open_issues_count ?? "—"} issues</span>
                    <span className="rounded-lg bg-zinc-900 px-2 py-1">Branch: {r.default_branch ?? "—"}</span>
                    <span className="rounded-lg bg-zinc-900 px-2 py-1">Pushed: {formatMaybeDate(r.pushed_at)}</span>
                  </div>
                </div>

                <div className="shrink-0 rounded-2xl bg-zinc-900 p-3">
                  <div className="text-xs text-zinc-400">Health</div>
                  <div className="mt-1 text-2xl font-semibold">{r.health?.score ?? "—"}</div>
                  <div className="mt-1 text-xs text-zinc-300">{badge(r.health?.score || 0)}</div>
                  <div className="mt-2 text-[11px] text-zinc-500">
                    CI: {r.checks?.conclusion ?? "unknown"} • Issues: {r.health?.signals?.openIssues ?? "—"}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-zinc-900/40 p-3 text-sm">
                <div className="text-xs text-zinc-400">Latest commit</div>
                <div className="mt-1 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-zinc-100">
                      {r.latest_commit?.message || "—"}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {r.latest_commit?.author || "—"} • {formatMaybeDate(r.latest_commit?.date)}
                    </div>
                  </div>
                  {r.latest_commit?.url ? (
                    <a
                      className="text-xs text-zinc-300 underline hover:text-zinc-100"
                      href={r.latest_commit.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on GitHub
                    </a>
                  ) : null}
                </div>
              </div>

              {r.error ? (
                <div className="mt-3 rounded-xl border border-yellow-900/50 bg-yellow-950/20 p-3 text-xs text-yellow-200">
                  {r.error}
                </div>
              ) : null}
            </div>
          ))}

          {!sortedRepos.length && !loading ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-300">
              No repos found. Set <span className="text-zinc-100">REPOS</span> in <span className="text-zinc-100">.env</span>.
            </div>
          ) : null}
        </div>
      </section>

      <footer className="mt-10 text-xs text-zinc-500">
        Data via GitHub API (cached in Redis, persisted in Postgres). Metrics at <span className="text-zinc-300">/metrics</span>.
      </footer>
    </main>
  );
}
