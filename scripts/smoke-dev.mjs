#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const clientDir = resolve(repoRoot, 'apps', 'web', 'client');
const DEV_URL = 'http://127.0.0.1:3000';
const HEALTH_URL = `${DEV_URL}/api/health`;
const PAGE_URL = `${DEV_URL}/`;
const PAGE_PATH = resolve(clientDir, 'src', 'app', 'page.tsx');
const MARKER_TARGET = 'Welcome to Onlook';

function pipeStream(stream, target) {
    if (!stream) return;
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => target.write(chunk));
}

async function waitFor(checkFn, attempts, intervalMs) {
    for (let i = 0; i < attempts; i += 1) {
        if (await checkFn()) {
            return true;
        }
        await delay(intervalMs);
    }
    return false;
}

async function waitForHealth() {
    const ok = await waitFor(async () => {
        try {
            const res = await fetch(HEALTH_URL, { cache: 'no-store' });
            return res.ok;
        } catch (error) {
            return false;
        }
    }, 60, 1000);

    if (!ok) {
        throw new Error('Timed out waiting for /api/health');
    }
}

async function waitForMarker(marker) {
    const ok = await waitFor(async () => {
        try {
            const res = await fetch(PAGE_URL, {
                headers: {
                    'cache-control': 'no-cache',
                    pragma: 'no-cache',
                },
            });
            if (!res.ok) {
                return false;
            }
            const body = await res.text();
            return body.includes(marker);
        } catch (error) {
            return false;
        }
    }, 60, 1000);

    if (!ok) {
        throw new Error('Hot reload did not propagate marker');
    }
}

async function main() {
    const devProcess = spawn('bun', ['run', 'dev'], {
        cwd: clientDir,
        env: {
            ...process.env,
            NEXT_TELEMETRY_DISABLED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let devExited = false;
    let devExitCode = null;
    let devExitError;

    devProcess.on('exit', (code) => {
        devExited = true;
        devExitCode = code;
    });
    devProcess.on('error', (error) => {
        devExitError = error;
    });

    pipeStream(devProcess.stdout, process.stdout);
    pipeStream(devProcess.stderr, process.stderr);

    let originalPage = '';
    let pageModified = false;

    try {
        await waitForHealth();
        console.log('Health check passed');

        originalPage = await readFile(PAGE_PATH, 'utf8');
        if (!originalPage.includes(MARKER_TARGET)) {
            throw new Error(`Unable to find marker target "${MARKER_TARGET}" in page.tsx`);
        }

        const marker = `hot reload marker ${Date.now()}`;
        const updatedPage = originalPage.replace(MARKER_TARGET, `${MARKER_TARGET} ${marker}`);

        if (updatedPage === originalPage) {
            throw new Error('Failed to apply marker update to page.tsx');
        }

        await writeFile(PAGE_PATH, updatedPage, 'utf8');
        pageModified = true;

        await waitForMarker(marker);
        console.log('hot reload active');
        console.log('Smoke test complete');
    } finally {
        if (pageModified) {
            await writeFile(PAGE_PATH, originalPage, 'utf8');
        }

        if (!devExited) {
            devProcess.kill('SIGTERM');
            await new Promise((resolve) => {
                devProcess.once('exit', resolve);
            });
        }

        if (devExitError) {
            throw devExitError;
        }

        if (devExitCode !== 0 && devExitCode !== null) {
            throw new Error(`Dev server exited with code ${devExitCode}`);
        }
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
});
