const { Octokit } = require("@octokit/rest");

function createOctokit(token) {
  return new Octokit({
    auth: token,
    userAgent: "aegis-monitor/1.0.0"
  });
}

async function fetchRepoBundle(octokit, owner, repo) {
  const repoRes = await octokit.repos.get({ owner, repo });
  const repoData = repoRes.data;

  const commitsRes = await octokit.repos.listCommits({
    owner,
    repo,
    per_page: 10
  });

  const latestCommit = commitsRes.data?.[0];
  const latestCommitInfo = latestCommit
    ? {
        sha: latestCommit.sha,
        message: latestCommit.commit?.message ?? "",
        author: latestCommit.commit?.author?.name ?? latestCommit.author?.login ?? "",
        date: latestCommit.commit?.author?.date ?? null,
        url: latestCommit.html_url ?? null
      }
    : null;

  const branch = repoData.default_branch || "main";
  let checks = null;

  if (latestCommit?.sha) {
    try {
      const runs = await octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        per_page: 1
      });

      const run = runs.data?.workflow_runs?.[0];
      checks = run
        ? {
            id: run.id,
            name: run.name,
            status: run.status,
            conclusion: run.conclusion,
            html_url: run.html_url,
            created_at: run.created_at,
            updated_at: run.updated_at
          }
        : null;
    } catch {
      checks = null;
    }
  }

  return {
    full_name: repoData.full_name,
    private: repoData.private,
    html_url: repoData.html_url,
    description: repoData.description,
    default_branch: branch,
    stargazers_count: repoData.stargazers_count,
    forks_count: repoData.forks_count,
    open_issues_count: repoData.open_issues_count,
    pushed_at: repoData.pushed_at,
    updated_at: repoData.updated_at,
    owner: {
      login: repoData.owner?.login,
      avatar_url: repoData.owner?.avatar_url
    },
    latest_commit: latestCommitInfo,
    checks
  };
}

module.exports = { createOctokit, fetchRepoBundle };
