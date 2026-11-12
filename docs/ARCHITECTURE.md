# Architecture

The host contains the LLM and an MCP client. The wrapper is an MCP server to the host and an MCP client to a separately spawned Playwright MCP dependency. Both links use stdio; only the wrapper's nine research tools are exposed to the host. There is no HTTP endpoint or internal model API.

`index.ts` creates one runtime, serves MCP, and handles stdin closure/signals. `server.ts` registers strict schemas and converts service errors to sanitized MCP errors. Services implement use cases; the persistent engine claims jobs serially. Adapters translate requests into a closed set of browser actions; the client owns dependency discovery, processes and output parsing. SQLite is authoritative for jobs, source snapshots and evidence. Export/deletion share a per-job asynchronous mutex.

```text
Host LLM -> MCP client -> server.ts -> services
                                  -> JobEngine -> Adapter -> BrowserClient
                                                        -> Playwright MCP -> Browser
                                  -> Store / DataService -> local files
```

Source selection is a host task: discover candidates, inspect result identity, choose, register, search. An automated test choosing the first candidate does not prove that the host LLM chooses according to the user's intent.

The runtime holds an exclusive transaction in a separate `runtime-lock.sqlite` for its entire lifetime. It opens the research database only after obtaining ownership. Main research transactions remain short. Crash recovery finishes interrupted jobs and never replays them. A live owner is never displaced; only one worker manipulates the profile.

Abort signals and deadlines cover browser calls. Terminal records reject late writes. Browser cleanup precedes subsequent browser jobs. Login-required attempts finish and queued attempts are marked needs_login without navigation; only an explicit new submission retries preflight. Shutdown stops admission, aborts/drains work, waits for file operations, closes the browser/client/database, and releases ownership. Browser close allows a five-second grace before owned-tree termination.

Facebook selectors are fixed source code, tested on synthetic DOM and **not live-verified**. They must not be treated as stable Facebook APIs. Source URLs and the URL captured alongside extraction are rechecked. A limited retry is allowed for a classified read failure. No arbitrary code, page-advertised WebMCP tool, cookies, raw diagnostic dump or browser storage state is returned through wrapper tools. URL restrictions alone do not sandbox browser requests; operating-system/process/filesystem controls are separate.
