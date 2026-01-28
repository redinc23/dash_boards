const { z } = require("zod");

const schema = z.object({
  NODE_ENV: z.string().default("production"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.string().default("info"),

  REPOS: z.string().min(3, "REPOS must be like owner/repo,owner/repo"),
  GITHUB_TOKEN: z.string().min(10, "GITHUB_TOKEN is required"),

  POLL_INTERVAL_MS: z.coerce.number().int().min(5000).default(30000),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(5).default(25),

  DATABASE_URL: z.string().min(10),
  REDIS_URL: z.string().min(10),

  CORS_ORIGIN: z.string().default("http://localhost:3000")
});

function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration: ${msg}`);
  }

  const repos = parsed.data.REPOS.split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const normalizedRepos = repos.map(r => {
    const [owner, repo] = r.split("/");
    if (!owner || !repo) throw new Error(`Invalid repo "${r}". Expected "owner/repo".`);
    return { owner, repo, full_name: `${owner}/${repo}` };
  });

  return {
    ...parsed.data,
    repos: normalizedRepos
  };
}

module.exports = { loadConfig };
