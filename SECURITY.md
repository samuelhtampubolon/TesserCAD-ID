# Security

## Reporting something

Open an issue at
[github.com/samuelhtampubolon/TesserCAD/issues](https://github.com/samuelhtampubolon/TesserCAD/issues).
There is no server, no user account and no stored user data anywhere but the
machine the application is running on, so there is no incident response to
co-ordinate and nothing gained by reporting privately first. A public issue gets
it fixed faster.

---

## Threat model

Being specific about this is the difference between security work and security
theatre. Most of the standard web threat model does not apply here, and saying
so is more useful than a checklist of mitigations for attacks that cannot happen.

**What does not exist:** no server, no database, no accounts, no sessions, no
cookies, no authentication, no authorisation, no multi-tenancy, no uploads, no
outbound requests. There is nothing to phish, no session to fix, no token to
steal, no SQL to inject, no SSRF target and no privilege to escalate to.

**What does exist, and is the whole of the attack surface:** this application
opens files that other people wrote. A `.tcad` document, an STL, an OBJ, a DXF,
a design-intent JSON, a pasted spec, a typed instruction. Every one of those is
untrusted input that is parsed and then used to build geometry and render text.

So the four things that could actually go wrong:

| | Attack | Defence |
|---|---|---|
| 1 | A crafted file executes script in the page | No dynamic code execution anywhere; every rendered value escaped; a Content-Security-Policy with no `unsafe-inline` |
| 2 | A crafted file corrupts the object model | Prototype pollution closed at every parse boundary; a null-prototype expression scope |
| 3 | A crafted file hangs or crashes the tab | Every catalogue parameter clamped at load; segment products capped; the expression parser bounded |
| 4 | A crafted file reads something it should not | Nothing is read but what the user opens; in the desktop build, path containment on the resolved path plus an extension allowlist |

Each is tested as a live attack in `tools/tests/security.mjs`, and the desktop
build's own surface in `tools/tests/desktop.mjs`. An audit is a snapshot; those
suites are a ratchet.

---

## What is enforced, and how to check it

### Content-Security-Policy

`index.html` carries `default-src 'none'` with every directive narrowed to this
origin. This is what turns "this application makes no network calls" from a
sentence in a README into something the browser guarantees.

```
default-src 'none';
script-src 'self' 'sha256-…';   one hash, for the inline import map
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self' data: blob:;   no http or https origin at all
worker-src 'self' blob:;
form-action 'none'; base-uri 'none'; object-src 'none';
```

`connect-src` permits no network origin, so a telemetry call could not leave
even if one were added by mistake. `script-src` allows neither `unsafe-inline`
nor `unsafe-eval`.

**Check it yourself.** Open the developer tools, reload, and look at the network
panel: after the first visit there is nothing there. Then try to inject a script
from the console:

```js
const s = document.createElement('script');
s.textContent = 'window.x = 1';
document.body.appendChild(s);
window.x;              // undefined: the policy refused it
await fetch('https://example.com');   // rejected before a packet leaves
```

The one inline script is the import map, which must be inline to apply to the
modules that follow it, and is pinned by a SHA-256 hash. A stale hash breaks the
whole application, so it is computed rather than remembered:
`node tools/check-csp.mjs` verifies it and runs as part of `npm test`.

### What this deployment does *not* protect against

`frame-ancestors` and `X-Frame-Options` can only be delivered as HTTP headers,
and GitHub Pages serves no custom headers. **Clickjacking is therefore not
prevented on the hosted copy.** That is a real gap and it is named here rather
than omitted.

If you serve your own copy behind any ordinary web server, add:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
```

The desktop build already sends all of these, because there it controls the
server. That asymmetry is why the desktop build is the more locked-down of the
two.

### No dynamic code execution

The expression engine is a hand-written tokeniser and recursive-descent parser.
It exists precisely so that a dimension typed as `width * 2`, or arriving inside
a file, is never handed to `eval` or `Function`. The security suite asserts that
**no file in the project** contains `eval(`, `new Function(`, `Function(`, or a
string-bodied timer, and that assertion covers the test suites too.

### Validation at the trust boundary

The feature catalogue declares `min` and `max` for every numeric field. Those
are enforced in `migrate()`, which every document passes through however it
arrived, rather than in the inspector widget. Before this, the limits were a
hint to one widget and a hand-edited file skipped them entirely.

Segment counts multiply, so the product is capped as well as each factor. A
`select` field cannot be set to a value outside its options. Non-finite numbers
fall back to the catalogue default. Expressions are left alone, because a string
cannot be range-checked without evaluating it, and the engine already refuses a
non-finite result by name at build time.

### Prototype pollution

Closed at every parse boundary and tested by four separate routes: a `__proto__`
key in feature parameters, a `constructor.prototype` payload, a `__proto__` on
the document root, and one nested inside a transform. The expression scope is
`Object.create(null)`, so a parameter can never be named after something on
`Object.prototype`, and the parser guards every lookup with `hasOwnProperty`, so
`toString` and `constructor` are not reachable as names.

---

## Your data

All of it stays on your machine. There is nowhere else for it to go.

| Stored | What it is |
|---|---|
| `tessercad.autosave.v3` | the document you have open |
| `tessercad.vcs.v1` | saved versions and branches |
| `tessercad.studio.v1` | standards, decisions, macros |
| `tessercad.prefs.v1` | preferences |
| `tessercad.why.v1` | which engineering notes you have seen |

Browser local storage, on this machine, readable by you and by nothing else.
**Help → Offline and ownership** lists it with sizes and will delete all of it.

Two things worth knowing. Clearing your browser data clears this too, so a
document you care about belongs in a saved file as well. And local storage is
not encrypted: anyone with access to your user account on your machine can read
it, exactly as they could read any file you saved.

---

## The desktop build

### Why the binary is not in the repository

A committed `.exe` is a blob nobody can review, cannot be traced to the source
it came from, and has to be trusted on the word of whoever pushed it. Built by
CI instead, every artefact comes from a commit anyone can read, by a workflow
anyone can read, on a runner nobody controls, with a SHA-256 published beside
it. That is strictly better for the person downloading it.

`.github/workflows/desktop.yml` runs the full test suite before packaging
anything, because a desktop build of a broken application is worse than none.

### Windows security warnings: what causes them, and what this edition chose

An earlier TesserCAD build tripped Windows security warnings. Most of that was
the project's own fault rather than a false positive about an unsigned file, and
the causes are worth naming - because two of the four were fixed for good, and
**this edition deliberately reverses the other two.** That reversal is the most
important paragraph on this page for anyone deciding whether to trust the
download, so it is not buried.

**Fixed for good: the binary carried no version information.**
`signAndEditExecutable` was set to `false` to express "there is no certificate
here". That option governs signing *and resource editing*, so turning it off
also stopped the real metadata being written, and the shipped file inherited
Electron's generic resource: no product name, no description, no company, no
copyright. An executable with no version information is itself a heuristic
signal. It is on now; no certificate is configured, so nothing is signed, but
the metadata is correct.

**Fixed for good: it opened a listening socket.** The shell used to serve the
application from `http://127.0.0.1` on a random port. That is a common Electron
pattern and it worked, but it meant every other process running as you could
reach a server handing out the application's files for as long as the window was
open. It is now served over a private `app://` scheme through a handler in
`desktop/protocol.cjs`, so **no port is opened at all**. That is a genuine
privacy improvement that happens also to remove a behaviour scanners notice.

**Reversed here: the self-extracting `portable` target is back.** TesserCAD
dropped it, and its reasoning was sound: a `portable` build is not simply "an
exe with no installer", it is a self-extracting archive that unpacks the whole
application into a temporary directory and executes it from there. Described
plainly, that is a single executable that writes a payload to a temp directory
and runs it, which is the defining runtime behaviour of a dropper, and endpoint
protection classifies on behaviour.

**Reversed here: `compression: maximum` is back.** That is solid LZMA, which
makes a result statistically hard to tell from a packed executable, and packing
is a signal in its own right.

### Why they were reversed, and what it costs you

This edition set out to ship a Windows download under 80 MB. A deflate archive
of the same tree measures 135 MB, and the only levers are the compressor, the
number of Chromium locale packs, and the Electron version. Two of those were
pulled - and pulling the first means solid LZMA.

It landed at 88.3 MB, not under 80. The front page says so, having said
otherwise until the first Windows build measured it. That matters here rather
than only in the README: the trade below was taken *for* a size target, so a
reader deciding whether the warning is worth it deserves the real number. What
the trade actually bought is 10% off upstream's installer and 35% off its
archive, for the same application.

So the trade is stated rather than hidden:

| | TesserCAD / TesserCADIna | TesserCAD-ID |
|---|---|---|
| Windows format | deflate `.zip`, plus an NSIS installer | LZMA `portable` `.exe`, plus an NSIS installer and a `.7z` |
| Compression | `normal` | `maximum` (solid LZMA) |
| Download size, measured | 135 MB zip / 98 MB installer | 88.3 MB portable / 88.5 MB installer, gated at 90 in CI |
| First-run warnings | SmartScreen, for being unsigned | SmartScreen, **and possibly a second heuristic warning** |

If a second warning matters more to you than 47 MB of download, use the hosted
version - it is the same application, needs no download, and works offline after
the first visit. If the size matters more, the verification path below is the
same one either way, and it is a stronger answer than a certificate.

Windows now gets:

| Download | What it is |
|---|---|
| `TesserCAD-ID-<version>-portable.exe` | **Recommended.** Runs with no install and no administrator rights. Self-extracting, so a scanner may flag the shape; the extraction directory is fixed rather than random, so the second run reuses the first |
| `TesserCAD-ID-<version>-setup.exe` | A per-user installer, for a Start-menu entry. Never elevates, never writes outside your profile |
| `TesserCAD-ID-<version>-windows-x64.7z` | The smallest transfer, for anyone who already has 7-Zip and would rather extract it themselves |

### What is still true: it is not code-signed

**SmartScreen will still show an "unknown publisher" prompt**, and macOS
Gatekeeper will still require an explicit override. Nothing above changes that,
and it would be dishonest to imply otherwise. Only a code-signing certificate
tied to a verified identity removes it. A self-signed certificate does not; it
only teaches people to click through warnings.

What you get instead is **stronger than a certificate for the question that
actually matters** - did this binary come from this source:

```bash
gh attestation verify TesserCAD-ID-1.0.0-portable.exe \
  --repo samuelhtampubolon/TesserCAD-ID
```

> **Artefacts published before the repository was renamed** record the old name
> inside their attestation, because the name is baked in at build time. The
> v1.0.4 attestation names
> `https://github.com/samuelhtampubolon/Portofolio_Tutorial@refs/tags/v1.0.4`,
> so for those files pass `--repo samuelhtampubolon/Portofolio_Tutorial`
> instead. The underlying repository id is unchanged (`1240582571`), and the
> next release carries the new name, after which only the command above is
> needed.

Every artefact is published with a signed build-provenance attestation naming
the commit, the workflow and the runner that produced it, recorded in a public
transparency log that the publisher does not control. A code-signing
certificate says "someone paid for an identity". An attestation says "this
exact file was built from that exact commit by that workflow", which is the
claim you wanted.

And the hash, for the offline case:

```powershell
Get-FileHash TesserCAD-ID-1.0.0-portable.exe -Algorithm SHA256
```

```bash
sha256sum TesserCAD-ID-1.0.0-portable.exe
```

### If you want the warning gone entirely

It needs a certificate, and the honest options are:

- **SignPath Foundation** issues free code-signing certificates to open-source
  projects. This project qualifies on licence and on being built in public CI.
- **Azure Trusted Signing** is inexpensive but requires a registered legal
  entity with three years of history.
- A commercial OV/EV certificate, which costs money annually and, for OV, still
  starts with no SmartScreen reputation.

None of these can be set up from inside the repository; each needs the
maintainer's identity. Until one is in place, the portable `.exe` plus
`gh attestation verify` is the recommended path, and **the hosted version needs
no download at all** - it is the same application.

### The shell's posture

The desktop build is a browser window with the browser taken away, which means
the browser's sandbox is no longer doing the work and the shell has to. It is
configured as strictly as Electron allows, not as its defaults suggest:

| Setting | Value | Why |
|---|---|---|
| `sandbox` | on | The renderer runs in an OS-level sandbox |
| `contextIsolation` | on | Page scripts cannot reach Electron's internals |
| `nodeIntegration` | off | Without this, an XSS is not a script injection, it is arbitrary code execution on your machine |
| `nodeIntegrationInWorker` | off | The same, for the boolean workers |
| `webSecurity` | on | Same-origin policy applies; the app's own CSP is served with the page |
| `webviewTag` | off | Nothing needs it, and it is an embedding surface |
| `navigateOnDragDrop` | off | Dropping a file cannot navigate the window |
| preload script | none | There is nothing the page needs from the host, so there is no bridge to audit |
| listening sockets | none | The application is served through an in-process protocol handler, so no port exists for another local process to connect to |

Navigation and window creation are refused outright; a CAD application has no
reason to follow a link to another origin, and `https://` links are handed to
your real browser instead. Every permission request is denied: no camera, no
microphone, no geolocation, no notifications.

The application is served over a private `app://` scheme, registered as
`standard` and `secure`, rather than `file://` or a loopback HTTP server. ES
modules and the import map need a real origin, which `file://` does not
usefully provide, and under `file://` every local file is same-origin with the
page. A loopback server solves that but opens a port any local process can
reach. The scheme solves it with no socket at all.

That handler is the only code in the desktop build that turns an untrusted
string into a filesystem read, so it lives in `desktop/protocol.cjs` separately
from the Electron shell specifically so it can be tested - it is a plain
function from a `Request` to a `Response`, so the tests drive the same function
the shell installs rather than a stand-in. Containment is checked on the
**resolved, normalised** path, which is the only form of the check that holds:
`..` segments, percent-encoded separators, double-encoded separators,
backslashes and absolute paths all collapse before the comparison. An extension
allowlist is a second, independent barrier, so a `.pem` or a `.env` inside the
tree is refused even though it resolves inside it. Fourteen traversal encodings
are attacked directly in `tools/tests/desktop.mjs`, and the suite also asserts
that the build opens no listening socket and contains no loopback origin.

The developer tools are deliberately left enabled. An application claiming your
data never leaves the machine should let anyone open the network panel and
confirm it.

---

## The audit this edition inherited

The review below was carried out on TesserCADIna 1.1.0 and every fix it
produced is in this tree, with its test. It is reproduced rather than
summarised because the three findings are properties of code this edition still
runs, and a reader assessing the download should see them stated rather than
know only that an audit happened.

A review of the whole product against the four questions that matter for a tool
that claims your work stays on your machine: what it stores, what it sends,
what it can reach on the machine it runs on, and whether it can lose your work.
Three things came out of it that were worth changing. Each has a test, and each
test was run against the old code first to confirm it fails there.

### A symbolic link could leave the application directory

`resolveSafely` in `desktop/protocol.cjs` is the only route from the renderer to
the disk, and it was checking the **path** rather than the **file**.
`path.resolve` collapses `..` but knows nothing about links, so a link sitting
inside the application directory and pointing outside it passed the check and
then served whatever it pointed at. Named `leak.png` it read as an ordinary
asset and it satisfied the extension allowlist.

Reaching it needed a link already inside the installed directory, so this was
not remote: it is a containment property that did not hold, not a live path from
a web page to your home directory. The check is now applied a second time to the
resolved real path, on both sides, and `tools/tests/desktop.mjs` attacks it with
a link to a file, a link named with an allowed extension, and a linked
directory. A link that stays inside the tree is still served, because the
property is containment and not a ban on links.

### Autosave could fail while the interface said it had not

`saveLocal` returns `false` when browser storage refuses the write, and the
caller cleared the saved indicator regardless. Browser storage is a few
megabytes and one imported mesh is larger than that, so a full quota is the
ordinary case. The document stayed dirty, so the "you have unsaved changes"
prompt on closing the tab still fired and no work was actually lost - but an
indicator that reports success at the moment it stops writing is worse than no
indicator. The indicator now follows the result, and the failure is reported
once per run of failures rather than every few seconds.

### The build could be reached through someone else's tag

`softprops/action-gh-release` is the one third-party action here and it runs in
the job that holds `contents: write`. It was pinned to `v2` - a name its owner
can repoint at any time, which would have been fetched by the next release job.
It is pinned to a commit now. `ci.yml` also declared no `permissions:` block at
all, so it ran with whatever the repository default happened to be; it states
`contents: read`, which is all it needs.

The security suite now asserts both properties for every workflow, so neither
can be undone quietly.

### Checked and found sound

Recorded because "we looked" is worth as much as what was found:

- **Nothing leaves the machine.** Already asserted by the suite for the page;
  the desktop shell additionally resolves every hostname to nothing
  (`host-resolver-rules`), so the guarantee is that the program cannot reach the
  network, not that its telemetry is switched off.
- **The shop drawing escapes what it interpolates.** The part name, material and
  author reach an SVG that is assigned with `innerHTML`; all of them pass
  through `esc()`. Dimension labels are formatted numbers and library constants.
- **The service worker is same-origin and scoped to this application's path**,
  which matters because GitHub Pages serves this and TesserCAD from one host.
- **Engineering results do not carry non-finite numbers.** A zero-area section
  and an absurd bolt load were probed; neither produced `NaN` or `Infinity`
  where a user would read a figure.
- **Device access is denied twice.** WebUSB, Web Serial and WebHID reach
  hardware through a chooser the permission handler does not sit in front of.
  Electron cancels a chooser with no listener, so this was already closed; it is
  now stated explicitly rather than resting on a default.

---

## Dependencies

Runtime: **one**, vendored. three.js r169, unmodified, MIT, with its licence at
`vendor/THREE-LICENSE.txt`. Nothing is fetched at runtime, and the CSP would
refuse it if it were.

`npm install` for the web application downloads nothing: `node_modules/three` is
a shim pointing at `vendor/`, created by `tools/setup-dev.mjs` so Node can run
the test suites against the same files the browser loads. There is no bundler, no
transpiler and no build step, which means the code you audit is the code that
runs - there is no output artefact in which something could differ.

The desktop shell has two development dependencies, `electron` and
`electron-builder`, installed only on the CI runner that packages a release.
They never reach a user's machine as source, and the web application does not
depend on them at all.

---

## Verifying the whole claim

```bash
npm test                          # 944 checks, 17 suites, ~4 seconds
node tools/tests/security.mjs     # the attacks, on their own
node tools/tests/desktop.mjs      # the desktop surface
node tools/check-csp.mjs          # the policy's hash is current
```

Nothing in that requires a network, an account or a build.
