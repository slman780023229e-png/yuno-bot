import fs from 'node:fs';
import path from 'node:path';

const DB_FILE = path.join(
  process.cwd(),
  'data',
  'arthur_bank_games',
  'state.json'
);

const REMOTE_PATH = 'data/arthur_bank_games/state.json';
const DEBOUNCE_MS = 2500;

let timer = null;
let dirty = false;
let running = null;
let lastError = null;

// In GitHub Actions, the workflow commits the whole project tree.
// Disable API writes there to avoid racing git push on the same branch.
// Outside Actions, keep the existing bank/game database sync behavior.
function shouldUseApiSync() {
  return process.env.GITHUB_ACTIONS !== 'true';
}

function getConfig() {
  const token = process.env.ARTHUR_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const branch = process.env.GITHUB_REF_NAME;

  if (!token || !repository || !branch) {
    throw new Error('GitHub sync configuration is missing.');
  }
  return { token, repository, branch };
}

async function uploadSnapshot(content) {
  const { token, repository, branch } = getConfig();
  const apiUrl =
    `https://api.github.com/repos/${repository}/contents/` +
    REMOTE_PATH.split('/').map(encodeURIComponent).join('/');

  for (let attempt = 1; attempt <= 5; attempt++) {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    const query = new URLSearchParams({ ref: branch });
    const response = await fetch(`${apiUrl}?${query}`, { headers });

    let sha;
    if (response.ok) {
      sha = (await response.json()).sha;
    } else if (response.status !== 404) {
      throw new Error(`GitHub read failed: HTTP ${response.status}`);
    }

    const body = {
      message: 'chore: update ARTHUR game database',
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch
    };
    if (sha) body.sha = sha;

    const result = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (result.ok) {
      lastError = null;
      return;
    }
    if (attempt < 5 && (result.status === 409 || result.status === 422)) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      continue;
    }
    throw new Error(`GitHub upload failed: HTTP ${result.status}: ${await result.text()}`);
  }
}

async function drainQueue() {
  while (dirty) {
    dirty = false;
    if (!fs.existsSync(DB_FILE)) {
      throw new Error('Local game database was not found.');
    }
    const snapshot = fs.readFileSync(DB_FILE, 'utf8');
    await uploadSnapshot(snapshot);
  }
}

export function scheduleArthurGithubSync() {
  // Keep the export for compatibility with existing imports.
  if (!shouldUseApiSync()) return;

  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!running) {
      running = drainQueue()
        .catch(error => {
          lastError = error;
          dirty = true;
          console.error('[ARTHUR GITHUB SYNC]', error.message);
        })
        .finally(() => {
          running = null;
          if (dirty && !timer) {
            timer = setTimeout(() => {
              timer = null;
              void flushArthurGithubSync().catch(() => {});
            }, 15000);
          }
        });
    }
  }, DEBOUNCE_MS);
}

export async function flushArthurGithubSync() {
  if (!shouldUseApiSync()) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (running) await running;
  if (dirty) {
    running = drainQueue();
    try {
      await running;
    } catch (error) {
      lastError = error;
      throw error;
    } finally {
      running = null;
    }
  }
  if (lastError) throw lastError;
}

export function getArthurGithubSyncStatus() {
  if (!shouldUseApiSync()) return { pending: false, error: null };
  return {
    pending: dirty || Boolean(timer) || Boolean(running),
    error: lastError?.message || null
  };
}
