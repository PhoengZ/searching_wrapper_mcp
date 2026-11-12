# Research tool contracts

Runtime schemas in `src/schemas/tools.ts` and `output.ts` are authoritative. All inputs reject unknown fields. Valid-schema business errors return `isError: true` and an application code; malformed inputs follow SDK validation semantics. Accepted async failures are stored in the job. Reading a failed job is itself a successful query.

| Tool | Input | Output and effects |
|---|---|---|
| `discover_sources` | query, optional platform=facebook, max_candidates=5, max_duration_seconds=30 | New queued discovery job; browser work later persists candidates. Host chooses by observed identity/user intent, never a fabricated URL |
| `register_source` | Exactly one candidate_id/url; source_type; name required for URL registration unless updating an existing named entry; optional source_id | Source registry write; no browser call. Unsupported platform types rejected; authorization checked |
| `list_sources` | cursor?, page_size=20 | Local saved sources and last verified capabilities; no refresh. Cursor is the last source ID |
| `start_search` | source_id, keywords[1–20], match_mode=any, date_from/date_to?, timezone=Asia/Bangkok, max_posts=30, include_comments=false, comment limits?, max_duration_seconds=180, resume_from_job_id? | New queued search job and immutable source snapshot. One source per job; every submission is a new job |
| `get_job` | job_id, cursor?, page_size=20 | Status, timestamps, counters, requested/effective filters, source snapshot, limitations, stop reason, items and next_cursor. Read-only; never requeues |
| `read_comments` | source_id, post_record_ids[1–30], sort? newest/relevant, max_comments_per_post=20, max_total_comments=300, max_duration_seconds=180 | New queued comments job for existing source-owned post identities. Browser/SQLite effects |
| `cancel_job` | job_id | cancellation_requested and current status. Idempotent. Preserve committed results; poll for final cancelled status |
| `export_results` | job_id, format=json/csv, filename? safe basename with matching extension | Export manifest with local path/row count/limitations. Terminal search/comments only; writes a new file; never overwrites |
| `delete_job` | job_id | deleted/deleted_exports. Terminal jobs only; database and owned-file deletion. Repeated missing deletion is a no-op |

Search defaults and ceiling values are documented in README; config can lower server ceilings. Dates are inclusive calendar dates in the supplied valid IANA timezone. `phrase` requires exactly one keyword string; any/all match literal normalized substrings. Comment limits may be zero only when comments are disabled; otherwise use positive limits. No password, OTP, cookie, profile path, arbitrary JavaScript or shell argument is accepted.

For include_comments=true, comments share the search job's deadline and total budget. Otherwise read_comments creates a separate job. Results and exports are per-job; no automatic multi-job merge is implemented.

Statuses: queued, running, needs_login, completed, partial, failed, cancelled. Stop reasons include limit_reached, no_more_results, time_limit, login_required, access_denied, rate_limited, unsupported_ui, user_cancelled, interrupted, shutdown, source_mismatch and sanitized dependency failures. `completed` is bounded workflow completion only.

Common application errors: SOURCE_NOT_FOUND, JOB_NOT_FOUND, CANDIDATE_NOT_FOUND, INVALID_SOURCE_URL, AUTHORIZATION_REQUIRED, UNSUPPORTED_CAPABILITY, SOURCE_IDENTITY_CHANGED, INVALID_RESUME_JOB, INVALID_POST_SELECTION, LIMIT_EXCEEDED, QUEUE_FULL, RUNTIME_UNAVAILABLE, PROFILE_IN_USE, INVALID_CURSOR, JOB_NOT_TERMINAL, UNSUPPORTED_EXPORT_KIND, INVALID_EXPORT_FILENAME, EXPORT_EXISTS, CLEANUP_INCOMPLETE. See README for login/retry and config remedies. Unexpected internal exceptions are not returned as raw stacks or successful empty results.
