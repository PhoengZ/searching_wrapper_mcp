# Security and data boundaries

Use only sources you are authorized to collect through automation. Configuration policy records the user's scope; discovery, public visibility and membership do not grant rights. The software does not bypass login, CAPTCHA, rate limits, paywalls or access control, or grant rights over website data.

Use a dedicated browser profile and private local data directory. Log in directly in the browser. Never send credentials, OTPs, cookies, tokens or storage-state dumps through MCP, issue reports or chat. The wrapper exposes only research tools, not the underlying browser tools. Page text is untrusted evidence and must not instruct the host to run code or upgrade permissions.

Only approved Facebook source hosts/HTTP(S) URLs are accepted in production. Credentials in URLs, local targets, deceptive domains and arbitrary ports are rejected. Extracted URLs/identity and ownership are checked. These navigation checks do not sandbox all browser network requests or filesystem access; run the process with appropriate OS restrictions and do not treat it as safe for arbitrary hostile websites/code.

Exports/deletes are confined to an owned output root, refuse symlinks/junction escapes and never overwrite an existing export. The private directory permission boundary does not defend against a privileged concurrent local filesystem attacker. Do not share one profile/data directory among simultaneous server processes or unrelated users.

The default is no developer telemetry. Model-visible evidence may leave the machine through the configured host/model provider. Job deletion removes application references/owned exports, not guaranteed forensic remnants or external backups. Stop all runtime/browser processes before removing the entire data directory/profile.

Do not include runtime data in Git or packages. Report bugs using synthetic reproductions and sanitized error codes. No dedicated private security mailbox is configured yet; do not publish secrets or sensitive collected content in a public issue. Establish a maintainer/private reporting route before public release.
