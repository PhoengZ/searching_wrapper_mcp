# Local data model

`research.sqlite` uses foreign keys, parameterized statements and schema version 1. A future database version is refused rather than silently downgraded. `runtime-lock.sqlite` is a separate ownership mechanism, not the evidence database.

| Table | Content |
|---|---|
| `sources` | Latest registry entry, canonical target, version and last observed capabilities |
| `jobs` | Kind, strict request, immutable source snapshot, status/counters/limitations and timestamps |
| `candidates` | Observed discovery candidates with a global sequence and owning job |
| `identities` | Stable record ID and unique dedup key |
| `observations` | Immutable per-job evidence snapshots, sequence and identity relationship |
| `exports` | Owned output filename/path, format, row count and job |

Identity priority is platform ID, direct canonical item URL, then SHA-256 of normalized content/parent/raw date in the source namespace. A post-level URL cannot uniquely identify multiple comments. Fallback method and limitations are reported. A record appearing in a new job gets a new observation and seen_before metadata; the previous job's text/collection timestamp stays unchanged.

`published_at` is an observed/parseable publication instant; `published_at_raw` preserves displayed date text. Unknown publication dates are null/unknown and cannot satisfy an active range. `collected_at` records collection separately. Keyword matching is normalized literal matching (any/all/single phrase), not semantic search.

Comments carry `post_record_id`; `parent_id` is a verified stored parent identity only, otherwise null. Reply URL parameters are mapped to distinct reply IDs and parent IDs. Missing direct comment URLs produce post-level evidence and limitations. No bulk profile/member list is stored.

Continuation cursors capture job/kind, upper sequence and last sequence; queries are bounded to that snapshot and page/byte ceilings. A new first-page call sees later inserts. Source updates increment a version; accepted jobs retain the previous snapshot. Resume/comment selection rejects a changed canonical target even if source_id is reused.

Deleting a terminal job cascades its observations/candidates/export manifests and removes only orphan identities. Registered sources remain. File cleanup uses manifests and an explicit cleanup_pending tombstone so failure can be retried. Deletion does not promise forensic erasure from SQLite pages, operating-system snapshots or backups; full local dataset removal is a separate stopped-runtime operation.
