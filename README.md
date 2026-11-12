# Local Social Research MCP

An Apache-2.0 local MCP server for bounded social research. A host LLM discovers Facebook Page candidates from the user's request, chooses an observed source, and calls tools to collect evidence. The wrapper contains no internal LLM and requires no developer-hosted backend.

**Status: experimental, not a live-Facebook-verified release.** The local workflow and stdio protocol have automated coverage. The pinned Playwright MCP runs against Chrome in controlled browser tests. Facebook extraction is tested on synthetic intercepted HTML; authenticated Facebook compatibility and host LLM source selection still need acceptance testing. Unsupported UI must produce an explicit error, never a successful empty result.

## Requirements

- Node.js **24.19.0 or a tested later 24.x patch**; npm.
- An MCP host that supports launching local **stdio** servers. HTTP-only hosts cannot directly launch this server; Streamable HTTP is not implemented in this release.
- Installed Google Chrome (default) or Microsoft Edge (`WRAPPER_BROWSER=msedge`) for browser jobs.
- Tested environment: Windows, Node 24.19.0. Other operating systems are not yet release-verified.

## Install and build

From a downloaded source checkout:

```powershell
npm ci
npm run typecheck
npm run build
```

The executable is `node dist/index.js`. It waits for an MCP client on stdin; it is not an interactive command prompt or website. Protocol output uses stdout and diagnostics use stderr.

Runtime dependencies are pinned in `package-lock.json`, including MCP server/client SDK 2.4.0 and Playwright MCP 0.0.85. That Playwright MCP version embeds a Playwright alpha build; the exact browser combination must be tested before distribution. Startup does not download a replacement package or launch a browser until a browser job needs it.

## Try synthetic mode first

Configure your host with the pattern in [examples/host-config.example.json](examples/host-config.example.json). Replace the executable, repository and data-directory paths. The example uses **mock mode**, with clearly synthetic data and no social network access.

The host workflow is:

1. Call `discover_sources` with a topic, e.g. `DCA กองทุน`.
2. Poll that `job_id` with `get_job`; choose only an observed candidate matching the user's intent.
3. Call `register_source` with its `candidate_id` and `source_type: page`.
4. Call `start_search` with the returned `source_id`, keywords and limits.
5. Poll `get_job`. Call `read_comments` only for selected stored posts if requested.
6. Export a terminal search/comments job with `export_results`.
7. Use `delete_job` to remove a terminal job and its owned export files.

One search job uses one source. Multiple sources require separate jobs and share one serialized browser queue. A known valid source URL can skip discovery. A local export path is not automatically an uploaded chat download link; delivery depends on the host.

## Configure real browser mode

Set these environment variables in the host configuration:

| Variable | Meaning |
|---|---|
| `WRAPPER_MODE` | `mock` or `facebook` (default `facebook`) |
| `WRAPPER_DATA_DIR` | Absolute local data directory; Windows default `%LOCALAPPDATA%/local-social-research-mcp` |
| `WRAPPER_CONFIG_FILE` | Optional absolute path to a strict JSON config; see [example](examples/config.example.json) |
| `WRAPPER_BROWSER` | `chrome` (default) or `msedge` |
| `WRAPPER_HEADLESS` | `false` (default, enables manual login) or `true` |

`.env` files are not automatically loaded. Restart the server after configuration changes. Data directories require local filesystem SQLite locking; network shares are unsupported. Configuration is not accepted through untrusted tool arguments.

The example config denies external access initially. `authorization.facebook.discovery_allowed` permits Page discovery. `collection_scope` is `none`, `listed_sources` (canonical `source_urls`), or `platform`. A user with authorization covering dynamically selected Pages can configure the platform scope once; a fixed Page list and repeated confirmations are not required. These settings describe the user's authorized scope; they do not create permission from a website. Public visibility or group membership alone is not proof of permission to automate collection.

On `needs_login`, log in directly in the dedicated browser. Never pass passwords, OTPs, cookies or storage state to MCP tools or chat. After login, submit a new explicit job (optionally resume an eligible search). Old jobs do not restart when polled, and queued attempts are stopped without disturbing login. The profile persists in the data directory; do not use a personal default browser profile.

## What the adapter currently does

- Page discovery uses Facebook Pages search UI, returning observed names/URLs for the **host LLM** to choose.
- Search samples **visible feed posts** and filters text/dates locally. It does not promise an exhaustive Page search or enforce Facebook's own keyword/date filters.
- Post permalinks must establish ownership by the selected Page, or match the exact selected post. Comment articles must establish their containing post. Unverifiable aliases, shared/recommended foreign posts and unsupported permalink variants stop with `source_mismatch`; the document URL alone is insufficient evidence.
- Comments are opt-in. Direct evidence URLs, reply parents and sort are reported only when observed. Requested comment sorting is currently **not enforced**, and output reports `unknown` plus limitations.
- Missing/ambiguous dates remain unknown. With an active date range, unknown dates are excluded and counted.
- Facebook Groups, X and Instagram are unsupported; Page/post support remains experimental until live acceptance is recorded.
- No posting, liking, replying, group joining, arbitrary browser/code passthrough, access-control bypass or internal LLM.

## Limits and lifecycle

Defaults / hard maximums: posts **30/100**, comments per post **20/100**, total comments **300/1000**, search/comment duration **180/600 seconds**, discovery candidates **5/10**, discovery duration **30/120 seconds**, result page size **20/100**. Local config can lower the ceilings. Queue capacity defaults to 20; stored text is limited to 20,000 Unicode code points per item; paginated item payloads are limited to 256 KiB.

Post/comment limits count distinct **examined** items, not only matches. Invalid limits are rejected, not silently clamped. Durations start at `running`; queue wait is separate. Polling never creates jobs. Each submission creates a new job.

Cancellation preserves committed results and rejects late writes. A job deadline returns partial evidence with `time_limit`. Browser request timeouts report `browser_action_timeout` and terminate the owned browser process tree before another queued job runs; dependency failures also reset the browser. Tool discovery is bounded and cancellable. A new runtime marks interrupted queued/running jobs as partial/failed without automatic replay. `completed` means the bounded workflow finished, not complete coverage of a platform. See [tool contracts](docs/TOOLS.md).

## Local data, export and deletion

SQLite jobs/evidence, the profile, browser diagnostics and exports live below the configured data directory. Text sent back to the host may be forwarded to its model provider; local execution does not guarantee that model-visible evidence stays on the machine. No developer telemetry service is enabled.

JSON preserves original text/provenance. CSV uses UTF-8 BOM, quotes/newlines correctly, and escapes spreadsheet formula prefixes; the database text is unchanged. Export accepts a safe filename basename ending in `.json`/`.csv` and never overwrites an existing file. Export is per terminal search/comments job; discovery export and automatic merged multi-job exports are unsupported.

`delete_job` removes a terminal job, its observations and owned export files while preserving identities referenced by other jobs. Incomplete file cleanup remains retryable. Retention defaults to 30 days after completion, checked at startup/hourly; `retention_days: 0` disables expiry. Active jobs are never expired. Registered sources and browser sessions are separate from job deletion.

To erase the whole local dataset/profile, stop the MCP host/server and browser first, confirm the configured data directory, then delete that directory using the operating system. Never commit or publish runtime data.

## Development and verification

```powershell
npm run typecheck
npm run build
npm test
npm run test:browser
npm run check:package
```

`npm test` runs offline unit/integration tests, including real stdio child processes and temporary SQLite databases. `test:browser` uses the real pinned Playwright MCP and headless Chrome, with local/intercepted synthetic pages and no Facebook requests. It is not live verification.

`npm run test:live` is explicit opt-in and refuses to start without `WRAPPER_LIVE_QUERY`, `WRAPPER_CONFIG_FILE` and a dedicated `WRAPPER_DATA_DIR`. It uses real data and your configured authorization/login. See [testing instructions](docs/TESTING.md) for limitations and cleanup. A separate host walkthrough must verify semantic source choice by the host LLM.

## License and contributions

Original wrapper source is licensed under **Apache-2.0**; see [LICENSE](LICENSE). Dependencies retain their respective licenses. [Third-party attribution](THIRD_PARTY_NOTICES.md) and copied license/notice texts are included; the npm package does not bundle dependency source code or browser binaries. Do not imply endorsement by Microsoft, Meta or a model provider.

Local conversation/specification documents are intentionally git-ignored; public installation, architecture, tool, data-model and test documentation are tracked. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
