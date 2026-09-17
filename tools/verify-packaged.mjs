/**
 * Launch the packaged application and confirm the application actually starts.
 *
 * This exists because of a gap that let a broken download ship. The desktop
 * workflow packaged the app on Windows and Linux, and verified it by running
 * `tools/verify-desktop.cjs` under Electron on Linux only. That script is a
 * stand-in main process against the source tree: it proves the `app://`
 * scheme works, which is worth proving, and it never touches the artefact a
 * user downloads. So nothing in this repository had ever launched the packaged
 * Windows build. Not once.
 *
 * Everything packaging changes was therefore untested: the asar archive the
 * files are read out of, the locale paks `electronLanguages` filters away, the
 * executable's own bootstrap, and every path difference between a checkout and
 * `resources/app.asar`.
 *
 * What this checks is the only thing that matters to somebody who downloaded
 * it: does the window come up with the application running in it. The answer
 * comes from the application itself rather than from an exit code, which a
 * silent failure leaves at zero.
 *
 *   node tools/verify-packaged.mjs [path-to-binary]
 *
 * With no argument it finds the binary under dist-desktop/ for this platform.
 * Nothing to install: the DevTools endpoint is read with `fetch`, and the
 * optional in-page checks use Node's own WebSocket where there is one.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = 9322 + (process.pid % 200);          // parallel-run friendly

let fails = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  - ' + extra : ''}`);
};

/* ------------------------------------------------------------ the binary */

/**
 * Where electron-builder leaves the unpacked application for this platform.
 *
 * The unpacked directory is used rather than the installer or the portable
 * exe, because those wrap this same tree and unwrapping them needs a Windows
 * shell. If this tree does not start, neither does anything built from it.
 */
function findBinary() {
  if (process.argv[2]) return process.argv[2];
  const out = join(root, 'dist-desktop');
  if (!existsSync(out)) return null;
  const dirs = readdirSync(out).filter(d => /unpacked$/.test(d));
  for (const d of dirs) {
    const dir = join(out, d);
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (!statSync(full).isFile()) continue;
      if (process.platform === 'win32' && /^TesserCAD-ID.*\.exe$/i.test(name)) return full;
      // Linux: the launcher is the one large executable that is not a helper.
      if (process.platform !== 'win32'
        && /^tessercad/i.test(name) && statSync(full).size > 50 * 1024 * 1024) return full;
    }
  }
  return null;
}

/* --------------------------------------------------------------- the CDP */

const jsonList = async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
};

/** One `Runtime.evaluate` over the page's DevTools socket. */
async function evaluate(wsUrl, expression) {
  const ws = new WebSocket(wsUrl);
  try {
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error('devtools socket refused')), { once: true });
    });
    const reply = new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error('no reply from the page')), 15000);
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== 1) return;
        clearTimeout(timer);
        res(msg.result?.result?.value);
      });
    });
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    }));
    return await reply;
  } finally {
    try { ws.close(); } catch { /* already gone */ }
  }
}

/* ----------------------------------------------------------------- drive */

const bin = findBinary();
if (!bin || !existsSync(bin)) {
  console.log('FAIL the packaged application was not found'
    + '  - build it first: cd desktop && npm run dist, or pass the path');
  process.exit(1);
}
console.log(`     launching ${bin.replace(root, '')}`);

// A private profile directory per run. Electron holds a single-instance lock
// in the user profile, and a lock left by a killed run makes the next launch
// quit on the spot with no window and no message, which reads exactly like
// the application being broken. Learnt the hard way while testing this.
const profile = mkdtempSync(join(tmpdir(), 'tessercad-verify-'));
const args = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`];
if (process.platform !== 'win32') args.push('--no-sandbox');

const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', (b) => { stderr += b.toString(); });
child.stdout.on('data', (b) => { stderr += b.toString(); });

const quit = () => {
  try { child.kill(); } catch { /* already exited */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
};

let exited = null;
child.on('exit', (code) => { exited = code; });

try {
  // Wait for the page to appear, then ask it whether the application started.
  let page = null;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !page) {
    if (exited !== null) break;
    try {
      page = (await jsonList()).find(t => t.url && t.url.startsWith('app://'));
    } catch { /* devtools not up yet */ }
    if (!page) await new Promise(r => setTimeout(r, 1000));
  }

  ok('the packaged application stays running', exited === null,
    exited === null ? '' : `it exited with code ${exited}`);
  ok('and it opens a window on its own scheme', !!page,
    page ? page.url : 'no app:// page appeared within 90s');

  if (page) {
    ok('serving the application page itself', page.url.endsWith('/index.html'), page.url);
    ok('with the application title, so index.html was really parsed',
      /TesserCAD-ID/.test(page.title || ''), JSON.stringify(page.title));

    /**
     * The shell's own verdict, read without evaluating anything in the page.
     *
     * `desktop/main.cjs` polls the renderer for fifteen seconds and, on any
     * failure, navigates the window to `gagal.html`. So the window's URL after
     * that window has passed *is* the shell's answer: still on `index.html`
     * means its boot check was satisfied, and `gagal.html` means it was not.
     *
     * This is the primary check because it needs only `fetch`. The first
     * version of this file evaluated JavaScript in the page over a WebSocket
     * and passed locally on Node 22, where `WebSocket` is a global; the
     * desktop workflow pins Node 20, where it is not, so CI failed with
     * "WebSocket is not defined" after four checks had already passed. The
     * lesson is not to bump Node, though that is done too: the check that
     * matters most should need the least.
     */
    const settle = Date.now() + 30000;
    let verdict = page;
    while (Date.now() < settle) {
      await new Promise(r => setTimeout(r, 2000));
      let pages = [];
      try { pages = await jsonList(); } catch { break; }
      const gagal = pages.find(t => t.url && /gagal\.html/.test(t.url));
      if (gagal) { verdict = gagal; break; }
      const live = pages.find(t => t.url && t.url.startsWith('app://'));
      if (live) verdict = live;
    }
    const failedOver = /gagal\.html/.test(verdict.url || '');
    ok('the shell itself reports the application started', !failedOver,
      failedOver ? `it navigated to its failure page: ${decodeURIComponent(verdict.url).slice(0, 220)}`
        : `still on ${verdict.url}`);
    ok('and the window is still the application, not an error page',
      /TesserCAD-ID/.test(verdict.title || '') && !failedOver, JSON.stringify(verdict.title));

    // The deeper checks ask the page directly, which needs a WebSocket client.
    // Node gained one as a global in 22; this file must still be useful on 20,
    // so they are skipped rather than failed when there is none. The check
    // above already covers the question they answer, from the outside.
    if (typeof WebSocket === 'undefined') {
      console.log('     skipped the in-page checks: this Node has no global WebSocket'
        + ` (${process.version}); the shell's own verdict above stands`);
    } else {
    // The application removes #boot once it has started and hangs `tesserCAD`
    // off window. Either one alone can mislead: the splash is gone briefly
    // before the first document exists, and the global is set before the
    // first paint. Both together mean it started.
    const state = await evaluate(page.webSocketDebuggerUrl, `(async () => {
      const deadline = Date.now() + 40000;
      while (Date.now() < deadline) {
        const b = document.getElementById('boot');
        const started = (!b || b.classList.contains('gone')) && !!window.tesserCAD;
        if (started) break;
        await new Promise(r => setTimeout(r, 500));
      }
      const b = document.getElementById('boot');
      return {
        splashGone: !b || b.classList.contains('gone'),
        global: typeof window.tesserCAD,
        pesan: (document.getElementById('bootMsg') || {}).textContent || '',
        features: window.tesserCAD ? 'ada' : 'tidak ada',
        canvas: !!document.querySelector('canvas'),
        modules: !!(window.tesserCAD && window.tesserCAD.vp),
      };
    })()`);

    ok('the application boots: its splash clears', !!state && state.splashGone,
      state ? `bootMsg said ${JSON.stringify(state.pesan)}` : 'no answer from the page');
    ok('and its modules loaded, so the import map resolved inside the archive',
      !!state && state.global === 'object', state ? `typeof window.tesserCAD = ${state.global}` : '');
    ok('and it has a viewport, so three.js came out of the asar and ran',
      !!state && state.canvas && state.modules,
      state ? `canvas ${state.canvas}, viewport ${state.modules}` : '');
    }
  }
} catch (err) {
  ok(`driving the packaged application threw: ${err.message}`, false);
} finally {
  quit();
}

if (fails && stderr.trim()) {
  console.log('\n--- what the application printed ---');
  console.log(stderr.split('\n').filter(l => !/dbus|DevTools listening|StagingBuffer|SharedImage/.test(l))
    .slice(0, 25).join('\n'));
}
console.log(fails ? `\n${fails} FAILURES` : '\nALL PACKAGED-APP CHECKS PASS');
process.exit(fails ? 1 : 0);
