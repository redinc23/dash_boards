function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = { sleep, safeJsonParse, nowIso };
