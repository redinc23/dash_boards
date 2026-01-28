function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function computeHealthScore(snapshot) {
  const {
    open_issues_count = 0,
    pushed_at,
    updated_at,
    default_branch = "main",
    latest_commit,
    checks
  } = snapshot || {};

  const now = Date.now();
  const lastPush = pushed_at ? new Date(pushed_at).getTime() : 0;
  const daysSincePush = lastPush ? (now - lastPush) / (1000 * 60 * 60 * 24) : 365;

  const activityScore = clamp(100 - daysSincePush * 5, 0, 100);
  const issuesPenalty = clamp(open_issues_count * 2, 0, 40);
  const checksScore = checks?.conclusion === "success" ? 100 : checks?.conclusion ? 50 : 70;

  const commitRecencyScore = latest_commit?.date
    ? clamp(100 - ((now - new Date(latest_commit.date).getTime()) / (1000 * 60 * 60 * 24)) * 6, 0, 100)
    : 60;

  const raw = 0.35 * activityScore + 0.25 * commitRecencyScore + 0.25 * checksScore + 0.15 * (100 - issuesPenalty);
  const score = Math.round(clamp(raw, 0, 100));

  const signals = {
    daysSincePush: Math.round(daysSincePush * 10) / 10,
    openIssues: open_issues_count,
    checksConclusion: checks?.conclusion ?? "unknown",
    defaultBranch: default_branch,
    updatedAt: updated_at ?? null
  };

  return { score, signals };
}

module.exports = { computeHealthScore };
