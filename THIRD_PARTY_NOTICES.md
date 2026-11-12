# Third-party notices

The original wrapper is distributed under Apache-2.0. Dependencies retain their own licenses. This project calls Playwright MCP as a separate installed process; it does not relicense Microsoft's code or imply endorsement by Microsoft or Meta.

| Runtime dependency | Pinned version | License / source |
|---|---|---|
| MCP server SDK | 2.4.0 | Apache-2.0 — https://github.com/modelcontextprotocol/typescript-sdk |
| MCP client SDK | 2.4.0 | Apache-2.0 — https://github.com/modelcontextprotocol/typescript-sdk |
| Microsoft Playwright MCP | 0.0.85 | Apache-2.0 — https://github.com/microsoft/playwright-mcp |
| Playwright / Playwright Core | 1.66.0-alpha-2026-11-09 | Apache-2.0 — https://github.com/microsoft/playwright |
| Zod | 4.6.7 | MIT — https://github.com/colinhacks/zod |

The `third-party-licenses/` directory preserves license/notice files found in the installed runtime dependency tree used for this implementation, including Playwright's NOTICE and ThirdPartyNotices.txt. Consult `package-lock.json` for the full exact tree. The npm package contains wrapper code/docs and these notices, not bundled dependency code or browser binaries; those are separately installed under their own terms. Bundled ZIP/container/executable releases require inspection of all actual included components and notices.

No third-party implementation source was copied into the wrapper. Generic Apache license text is reused unchanged. Public release metadata must identify the actual maintainer/copyright owner without inventing an identity.
