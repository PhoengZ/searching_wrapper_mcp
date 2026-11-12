# Verification

Use the locked Node 24 toolchain. Run `npm ci`, `npm run typecheck`, `npm run build`, then `npm test`. A build is required before tests spawning `dist/index.js`/the lock-holder fixture. The default Vitest include paths exclude browser/live suites and never use Facebook credentials.

Offline tests cover real stdio tool discovery/invocation, strict inputs/URLs, source versions, SQLite persistence and rollback, OS-backed competing-process locks/crash recovery, serial queue/deadline/cancel/login states, filters and Bangkok date boundaries, immutable resume evidence, comments budgets, snapshot pagination, formula-safe exports and shared-identity deletion.

Noncooperative MCP child fixtures deliberately ignore action cancellation or stall tool discovery. Regression tests require termination before the next queued job and prompt close during setup, with and without a job abort. Anonymous comment identity includes its owning post, so identical text on different posts survives across jobs. Controlled browser fixtures also cover a parent comment without its own permalink beside a nested reply; the reply must not donate its URL or body to the parent. Ownership tests reject foreign posts/comments even when the browser document URL is correct.

`npm run test:browser` requires installed Chrome (or run with the tested Edge option). It starts the actual pinned Playwright MCP child and headless browser. Tests use localhost pages or intercept all requests with synthetic HTML; they do not validate live Facebook. Fixtures contain no real profiles, cookies or collected posts. A successful test asserts protocol/process cleanup, not just that a function returned.

## Explicit live acceptance

Use a dedicated persistent data directory and an absolute config file with genuine authorized scope. Set:

```powershell
$env:WRAPPER_MODE = 'facebook'
$env:WRAPPER_DATA_DIR = 'C:/path/to/dedicated-live-data'
$env:WRAPPER_CONFIG_FILE = 'C:/path/to/authorized-config.json'
$env:WRAPPER_LIVE_QUERY = 'your authorized Page discovery query'
$env:WRAPPER_LIVE_KEYWORD = 'a literal keyword expected in visible posts'
npm run test:live
```

Missing required settings cause an explicit failure before live access. Login must be performed by the user in the dedicated headed browser/profile. A login-required attempt finishes; rerun explicitly after login. Keep the profile outside the repository and never attach it to an issue.

The harness chooses the first observed candidate deterministically to exercise transport/collection, not an LLM relevance decision. It creates bounded temporary jobs, exports evidence, then deletes those jobs/owned exports; a registered source and the profile remain. It may return unsupported_ui on a Facebook variant because the adapter is experimental. Do not count failure/empty mock results as live acceptance. Standalone live comment acceptance and an actual host LLM walkthrough remain separate checks; record source identity, query, time, exact dependency/browser versions, outcomes and limitations before declaring support.

## Package checks

Run `npm run check:package` and inspect `npm pack --dry-run --json --ignore-scripts`. Required public docs/license/examples must be present; local plans, research reports, profiles, sessions, databases, logs and exports must be absent. CI/publishing/remote Host compatibility is not established merely by generating a package file list.
