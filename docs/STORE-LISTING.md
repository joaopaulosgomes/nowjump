# Chrome Web Store submission notes - NowJump 0.3.0

## Single purpose
A keyboard command palette for ServiceNow instances: navigate to tables, records and diagnostic pages, open the current record in the other UI, jump to related records, and see or switch the active update set.

## Permission justifications

| Permission | Why |
|---|---|
| `storage` | Settings, custom instance domains, and per-instance recents (table names, sys_ids, labels, timestamps). Local only, never synced. |
| `scripting` | Registers the same bundled content scripts on custom instance domains the user adds and approves. Nothing is fetched or generated; `registerContentScripts` points at files in the package. |
| `host_permissions: https://*.service-now.com/*` | Every ServiceNow instance lives under this domain by default. The palette must run on the instance page to read the URL and call the instance's own REST API with the user's session. |
| `optional_host_permissions: https://*/*` | Some customers serve ServiceNow from their own domain. The user types that domain in settings and Chrome prompts for exactly that origin. No origin is granted without the prompt. |

## Remote code
None. `content_security_policy.extension_pages` is `script-src 'self'; object-src 'self'`. No `eval`, no `new Function`, no `innerHTML` assignment, no external script or stylesheet. The brand icon is inlined as a data URI. Automated check: `test/run.js` "no remote code or dangerous sinks".

## Data use disclosure (for the store form)
- Collects: no personally identifiable information, no health/financial/authentication/personal communications/location/web history/user activity/website content beyond what is described below.
- The extension reads the current instance URL and issues REST calls to that instance with the user's existing session. Results are displayed and discarded; only navigation targets (table names, sys_ids, labels) are kept locally as recents.
- Not sold, not transferred, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending.

## Privacy policy
`PRIVACY.md` in the package. Host it at a public URL and paste that URL into the listing.

## Listing copy
Short: Keyboard command palette for ServiceNow: jump to tables, records and sys_ids, open in the other UI, see your update set.

Detailed:
Press Ctrl+K (Cmd+K on Mac) on any ServiceNow page. Type a table name, a record number (INC, CHG, DUP, DIS, Alert and any task type) or paste a sys_id, and press Enter. When a record is open, the palette also offers: open it in Workspace or classic UI, jump to related records, and see the active update set with a warning when it is Default. Works on UI16, Next Experience and workspaces with no configuration on the instance. Nothing leaves your browser.

## Screenshots to capture (1280x800)
1. Palette open on a Workspace record with the "This record" group and Default badge.
2. Typing `ecc` with curated and live matches.
3. A pasted sys_id resolved to its record.
4. Options page with a custom domain added.

## Before submitting
- Reload on a real instance and capture the four screenshots above.
- Confirm the custom-domain flow end to end on one non-standard hostname.
- Host PRIVACY.md and set the URL in the developer dashboard.
- Version in manifest matches the zip name.
