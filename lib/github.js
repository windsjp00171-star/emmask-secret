const https = require('https');

function request(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        'User-Agent': 'EmmArk-Secretary/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function getWeeklyActivity(daysBack = 7) {
  if (!process.env.GITHUB_TOKEN) return [];

  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  const repos = await request('/user/repos?per_page=100&sort=pushed&type=all');
  if (!Array.isArray(repos)) return [];

  const active = repos.filter(r => r.pushed_at >= since).slice(0, 12);

  const results = [];
  for (const repo of active) {
    const commits = await request(
      `/repos/${repo.full_name}/commits?since=${since}&per_page=5`
    );
    if (!Array.isArray(commits) || commits.length === 0) continue;

    results.push({
      name: repo.name,
      count: commits.length,
      latest: commits[0].commit.message.split('\n')[0].slice(0, 50),
      latestAt: commits[0].commit.author.date,
    });
  }

  return results.sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));
}

module.exports = { getWeeklyActivity };
