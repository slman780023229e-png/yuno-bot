import chalk from 'chalk';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAIN_FILE = path.join(__dirname, 'main.js');
const RESTART_DELAY = 3000;
const MAX_RESTART_DELAY = 30000;

const gold = chalk.hex('#D4AF37');
const blood = chalk.hex('#B32632');
const ivory = chalk.hex('#F2EBDD');
const muted = chalk.hex('#858585');
const green = chalk.hex('#39B982');

let child = null;
let stopping = false;
let restartTimer = null;
let restartDelay = RESTART_DELAY;
let restartCount = 0;

function line(char = '═', width = 58) {
  return char.repeat(width);
}

function showBanner() {
  console.clear();
  console.log(gold(`╔${line()}╗`));
  console.log(gold('║') + blood.bold('             ♛  🩸  A R T H U R  🩸  ♛') + gold('             ║'));
  console.log(gold('║') + ivory.bold('                  ARTHUR BOT') + ' '.repeat(28) + gold('║'));
  console.log(gold('╠' + line() + '╣'));
  console.log(gold('║') + muted('        AUTHENTIC SESSION  •  CORE ENGINE') + ' '.repeat(13) + gold('║'));
  console.log(gold('║') + muted('        MODULE SUPERVISOR  •  AUTO RECOVERY') + ' '.repeat(10) + gold('║'));
  console.log(gold('╠' + line() + '╣'));
  console.log(gold('║') + blood('             THE BLOODLINE EDITION') + ' '.repeat(21) + gold('║'));
  console.log(gold(`╚${line()}╝`));
  console.log('');
}

function protectSessionFolders() {
  const protectedDirs = ['ملف_الاتصال', 'session', 'sessions'];
  for (const name of protectedDirs) {
    const target = path.join(__dirname, name);
    if (fs.existsSync(target)) {
      console.log(green(`  ◈ محفوظ: ${name}`));
    }
  }
}

function clearTemporaryFiles() {
  const dirs = ['tmp', 'temp'];
  for (const name of dirs) {
    const target = path.join(__dirname, name);
    try {
      if (!fs.existsSync(target)) continue;
      for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        // Only remove regular files. Never recurse into or delete session folders.
        if (!entry.isFile()) continue;
        fs.unlinkSync(path.join(target, entry.name));
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ تعذر تنظيف ${name}: ${error.message}`));
    }
  }
}

function launchBot() {
  if (stopping || child) return;

  if (!fs.existsSync(MAIN_FILE)) {
    console.error(blood(`✖ ملف التشغيل غير موجود: ${MAIN_FILE}`));
    scheduleRestart();
    return;
  }

  restartCount += 1;
  console.log(gold(`\n╭─[ BOOT ${String(restartCount).padStart(3, '0')} ]────────────────────────────────────╮`));
  console.log(gold('│') + ivory('  Launching WhatsApp core process...') + ' '.repeat(15) + gold('│'));
  console.log(gold('╰──────────────────────────────────────────────────────────╯'));

  child = spawn(process.execPath, [MAIN_FILE], {
    cwd: __dirname,
    env: { ...process.env },
    stdio: 'inherit',
    windowsHide: true
  });

  child.once('error', error => {
    console.error(blood('✖ Unable to start main.js:'), error);
  });

  child.once('close', (code, signal) => {
    child = null;
    if (stopping) return;

    // Exit code 78 is reserved for an intentional authentication stop.
    // Do not create a restart loop or repeatedly request pairing codes.
    if (code === 78) {
      console.log(chalk.yellow('\n⏸ Core stopped for authentication review. Supervisor will remain idle.'));
      stopping = true;
      return;
    }

    if (code === 0) {
      console.log(muted('\n◈ Core exited normally; supervisor will not relaunch it.'));
      stopping = true;
      return;
    }

    console.log(blood(`\n✖ Core stopped (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`));
    scheduleRestart();
  });
}

function scheduleRestart() {
  if (stopping || restartTimer) return;
  const delay = restartDelay;
  console.log(chalk.yellow(`↻ Re-launch scheduled in ${Math.ceil(delay / 1000)} seconds...`));
  restartTimer = setTimeout(() => {
    restartTimer = null;
    launchBot();
  }, delay);
  restartDelay = Math.min(Math.round(restartDelay * 1.7), MAX_RESTART_DELAY);
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(chalk.yellow(`\n■ ${signal}: stopping ARTHUR supervisor...`));
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  if (child && !child.killed) {
    child.kill(signal);
    const childAtShutdown = child;
    const fallback = setTimeout(() => {
      if (child && child === childAtShutdown) child.kill('SIGKILL');
    }, 10000);
    fallback.unref?.();
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', error => {
  console.error(blood('✖ Supervisor exception:'), error?.stack || error);
});
process.on('unhandledRejection', error => {
  console.error(blood('✖ Supervisor rejection:'), error?.stack || error);
});

showBanner();
protectSessionFolders();
clearTemporaryFiles();
console.log(process.env.MONGO_URI
  ? green('  ◈ MongoDB auth storage: configured')
  : chalk.yellow('  ◈ MongoDB auth storage: not configured (local auth mode)'));
console.log('');
launchBot();
