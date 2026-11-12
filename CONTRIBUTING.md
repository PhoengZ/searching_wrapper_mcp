# Contributing

Use Node 24.19+ within the supported 24.x line, install with `npm ci`, and work on a dedicated task branch. Preserve strict TypeScript and stdio-only protocol output. Keep handlers thin; services, storage and browser adapters have separate responsibilities.

For a behavior change, add a meaningful regression/acceptance case, observe its expected failure, implement the smallest complete change, then run typecheck, build and the offline suite. Run controlled browser tests for browser changes. Live tests are opt-in and must have authorized sources. Update schemas, tool descriptions and public docs together.

Fixtures must be synthetic. Never commit profiles, databases, cookies, collected posts, machine-local config, exports, or local conversation/planning documents. `.gitignore` names local-only artifacts explicitly so public Markdown documentation stays tracked.

Before proposing a release, inspect the actual package, verify exact dependency compatibility, resolve blocking code-review findings and report which live/Host checks were not run. Include the Apache-2.0 license and required third-party attributions; contributors must have rights to submit their contributions under the project's license.
