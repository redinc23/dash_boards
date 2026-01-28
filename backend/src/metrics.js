const client = require("prom-client");

function createMetrics() {
  client.collectDefaultMetrics();

  const repoFetchDuration = new client.Histogram({
    name: "aegis_repo_fetch_duration_seconds",
    help: "Duration of fetching repo bundle from GitHub",
    labelNames: ["full_name", "result"]
  });

  const repoFetchTotal = new client.Counter({
    name: "aegis_repo_fetch_total",
    help: "Total repo fetch attempts",
    labelNames: ["full_name", "result"]
  });

  const wsClients = new client.Gauge({
    name: "aegis_ws_clients",
    help: "Number of connected websocket clients"
  });

  return { client, repoFetchDuration, repoFetchTotal, wsClients };
}

module.exports = { createMetrics };
