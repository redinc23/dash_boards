export function backendHttp() {
  return process.env.NEXT_PUBLIC_BACKEND_HTTP || "http://localhost:3001";
}

export function backendWs() {
  return process.env.NEXT_PUBLIC_BACKEND_WS || "ws://localhost:3001";
}

export async function fetchRepos() {
  const res = await fetch(`${backendHttp()}/api/repos`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch repos: ${res.status}`);
  return res.json();
}

export async function fetchHealth() {
  const res = await fetch(`${backendHttp()}/api/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch health: ${res.status}`);
  return res.json();
}
