// utils/arthurGithubSync.js
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
const RETRY_MS = 15000;

let timer = null;
let dirty = false;
let running = null;
let lastError = null;
let stopped = false;

function getConfig() {
  const token =
    process.env.ARTHUR_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN;

  const repository = process.env.GITHUB_REPOSITORY;
  const branch =
    process.env.GITHUB_REF_NAME ||
    process.env.GITHUB_HEAD_REF;

  if (!token || !repository || !branch) {
    throw new Error(
      'GitHub sync configuration is missing. Check Actions permissions and environment variables.'
    );
  }

  return { token, repository, branch };
}

function makeHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function readResponse(response) {
  const text = await response.text();

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function uploadSnapshot(content) {
  const { token, repository, branch } = getConfig();

  const apiUrl =
    `https://api.github.com/repos/${repository}/contents/` +
    REMOTE_PATH.split('/').map(encodeURIComponent).join('/');

  const headers = makeHeaders(token);

  for (let attempt = 1; attempt <= 5; attempt++) {
    const query = new URLSearchParams({ ref: branch });

    const readResponseResult = await fetch(
      `${apiUrl}?${query}`,
      { headers }
    );

    let sha;

    if (readResponseResult.ok) {
      const existing = await readResponseResult.json();
      sha = existing.sha;
    } else if (readResponseResult.status !== 404) {
      const details = await readResponse(readResponseResult);

      throw new Error(
        `GitHub read failed: HTTP ${readResponseResult.status}: ${
          details.message || 'Unknown error'
        }`
      );
    }

    const body = {
      message: 'chore: update ARTHUR game database',
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch
    };

    if (sha) body.sha = sha;

    const result = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (result.ok) {
      lastError = null;
      return;
    }

    if (
      attempt < 5 &&
      [409, 422].includes(result.status)
    ) {
      await new Promise(resolve =>
        setTimeout(resolve, attempt * 1000)
      );

      continue;
    }

    const details = await readResponse(result);

    throw new Error(
      `GitHub upload failed: HTTP ${result.status}: ${
        details.message || 'Unknown error'
      }`
    );
  }
}

async function drainQueue() {
  while (dirty) {
    dirty = false;

    if (!fs.existsSync(DB_FILE)) {
      throw new Error(
        `Local database not found: ${DB_FILE}`
      );
    }

    // Read the latest version immediately before upload.
    const snapshot = fs.readFileSync(DB_FILE, 'utf8');

    await uploadSnapshot(snapshot);
  }
}

function scheduleRetry() {
  if (stopped || timer || !dirty) return;

  timer = setTimeout(() => {
    timer = null;

    void flushArthurGithubSync().catch(error => {
      lastError = error;
      console.error(
        '[ARTHUR GITHUB SYNC] Retry failed:',
        error.message
      );

      scheduleRetry();
    });
  }, RETRY_MS);

  // Do not keep Node.js alive solely for the retry timer.
  timer.unref?.();
}

export function scheduleArthurGithubSync() {
  dirty = true;
  stopped = false;

  if (timer) clearTimeout(timer);

  timer = setTimeout(() => {
    timer = null;

    void flushArthurGithubSync().catch(error => {
      lastError = error;

      console.error(
        '[ARTHUR GITHUB SYNC]',
        error.message
      );

      scheduleRetry();
    });
  }, DEBOUNCE_MS);

  timer.unref?.();
}

export async function flushArthurGithubSync() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }

  // If another upload is active, wait for it first.
  if (running) {
    await running;
  }

  if (dirty) {
    running = drainQueue();

    try {
      await running;
    } catch (error) {
      dirty = true;
      lastError = error;
      throw error;
    } finally {
      running = null;
    }
  }

  if (lastError) {
    throw lastError;
  }
}

export function getArthurGithubSyncStatus() {
  return {
    pending: dirty || Boolean(timer) || Boolean(running),
    error: lastError?.message || null
  };
}