# NowJump - remaining work

Status against the two backlogs as of 14/09/2026. "Done" means implemented and covered by an automated test where one was possible. "Yours" means it needs a person, a browser, or a colleague - it was not faked.

## Delivery backlog (SNX-1)

| Ticket | Status | Notes |
|---|---|---|
| SNX-2 spike: injection | Done | Palette mounts on `<html>` in the top frame, never unmounts. Shortcut forwarded from child frames. Context re-resolved on every open, so SPA routing cannot leave it stale. No DOM selectors used anywhere - only URL shapes and `gsft_main` by id. |
| SNX-3 spike: endpoints | Done | Table API + `X-UserToken` from the MAIN-world bridge, `/navpage.do` scrape as fallback. 401/403/404 mapped to typed errors. |
| SNX-4 scaffold | Done | MV3, `storage` only, host scoped to `*.service-now.com`. Audit in README. |
| SNX-5 context | Done | 11 URL-shape tests pass. |
| SNX-6 palette shell | Done | Closed shadow root, own theme, focus trap, focus return, 90 ms animation under reduced-motion guard. 14 DOM tests. |
| SNX-7 registry + ranking | Done | Fuzzy + frecency, tested. |
| SNX-8 table nav | Done | Curated + live `sys_db_object`, merged, deduped. Falls back to curated silently on 403. |
| SNX-9 sys_id resolve | Done | Recents first, then candidates, batches of 6, dedupes parent/child hits. Notice names how many tables were unreadable. |
| SNX-10 TSE shortcuts | Done, seeded | 35 entries, admin-only ones hidden without the role. **Replace after the logging week (SNX-D2).** |
| SNX-11 other UI | Done | Workspace path configurable. |
| SNX-12 chain | Done | 11 tables configured, ITOM-weighted. Parents resolved with one fetch. |
| SNX-13 update set | Done | Default warning badge, production read-only, two-step confirm naming both sets. **Switch endpoint unverified on a live instance** - fallback path exists. |
| SNX-14 settings | Done | Per host, local only, clear-all. |
| SNX-15 degradation | Done | Copy from SNX-D8, no retry storm (one retry, network only). |
| SNX-16 security review | **Yours** | Static audit done and clean: no external hosts, no eval, no sync, no telemetry. The written sign-off with Siddiq or Eduardo is the gate for any customer instance, and only a person can give it. |
| SNX-17 upgrade matrix | **Yours** | Needs instances on different families. Zero CSS selectors means the exposure is limited to URL shapes and the `g_ck` / `NOW.user_id` globals - test those four things per release and you have covered it. |
| SNX-18 performance | Partly | No polling, no observers, 61 KB unminified. Paint time not measured - needs a real browser. |
| SNX-19 packaging | Done | `nowjump-0.1.0.zip`, install and rollback in README. |
| SNX-20 shortcut in fields | Done | Suppressed in input/textarea/select/contenteditable in every frame. Option to allow. |
| SNX-21 SPA unmount | Done | Root-cause fix (mount once on `<html>`, re-resolve on open), not a patch. |
| SNX-22 stale context | Done | Context and query reset on every open. |

## Design track (SNX-D1)

| Ticket | Status | Notes |
|---|---|---|
| SNX-D2 task inventory | Seeded | Derived from case files, not from logging. One week of real logging still needed. |
| SNX-D3 teardown | Done | Condensed in DESIGN-DECISIONS. |
| SNX-D4 interaction model | Done | Four decisions recorded with rejections. Keystroke spec implemented and tested. |
| SNX-D5 wireframes | Superseded | Built directly; the five states exist in code and are exercised by palette.test.js. |
| SNX-D6 visual spec | Done, unscreenshotted | Tokens recorded; contrast checked by formula. **Four shell/theme screenshots still needed** - headless Chromium was not reachable from the build sandbox. |
| SNX-D7 row anatomy | Done | Kind label, primary, secondary, meta; truncation order; group limits with +N footer. |
| SNX-D8 failure copy | Done | Six messages, all wired. |
| SNX-D9 context panel | Done | Persistent header group, max 4, production hides the switch. |
| SNX-D10 discoverability | Done | Options page on install; toolbar icon reopens it. No injected launcher. |
| SNX-D11 usability test | **Yours** | Five TSEs, four tasks. The extension is ready to be the prototype. |
| SNX-D12 accessibility | Partly | Roles, live region, focus trap and return are implemented and tested in jsdom. A real screen reader pass is still yours. |
| SNX-D13 naming and icon | Partly | Icons shipped. Name not checked against ServiceNow guidance. |

## The three things to do first

1. Load it on `empjgomes1`, press `Ctrl+K`, type `ecc`. If the palette does not appear, open DevTools console on the page and look for `nowjump` - the most likely cause is the bridge not finding `g_ck`, and the fix is a one-line addition to `bridge.js` naming wherever that instance keeps it.
2. Open a record, confirm the update set row shows your real current set. Then try a switch on the dev instance and see which path it took (the page reloads either way).
3. Book 30 minutes with Siddiq for SNX-16 before this touches any customer session.

## 0.1.2 - field fixes, 14/09/2026

Reported after first load: Escape did not close the palette; after typing it appeared stuck until a page refresh.

| Cause | Fix | Test |
|---|---|---|
| `.backdrop { display: flex }` outranked the `hidden` attribute, so close() ran but the overlay stayed on screen. This is why "stuck" needed a refresh - the palette was already closed underneath. | Explicit `display: none` on close and `[hidden]` rule in CSS (0.1.1). Explicit `input.blur()` on close (0.1.2). | palette.test.js |
| Escape handler lived only on the input. Workspace registers window-level key handlers before the content script loads and stops propagation on Escape. | Escape handled on `window` in capture phase with `stopImmediatePropagation`; `keyup` fallback for handlers that eat `keydown`; the shortcut now toggles closed; the "esc" hint is a button; backdrop listens for both `mousedown` and `click`; `pagehide` closes. | content.test.js reproduces a page handler that swallows Escape |
| No request had a deadline. One unanswered fetch left "Looking up…" forever. | 8 s hard timeout on every Table API request (becomes a "didn't answer in time" notice); 4 s cap on the token scrape; 5 s / 1.5 s caps on session and storage during open; 10 s watchdog on the loading state. | content.test.js proves the deadline fires |
| An exception anywhere in a handler killed the palette silently. | Every entry point wrapped in `safe()`; failures paint a notice; if painting itself fails the palette closes so the page is usable. | - |
| Nothing rendered until the live query returned. | Curated matches render synchronously on every keystroke; live results merge in ~90 ms later. Ranking guards against undefined labels. | registry.test.js `searchLocal` |

Contract change: curated results are synchronous against a role cache. The controller prefetches roles on open; admin-only shortcuts appear once that resolves (typically under a second).

## 0.2.0 - tables that exist, 14/09/2026

Reported: search offered tables that do not exist on the instance.

Checked against the `sys_db_object` export from `empjgomes1` (7,476 tables): every table the extension referenced exists there except `sn_customerservice_case` and `sn_customerservice_task` - CSM is not installed on an OOTB employee instance. The real defect was that the extension had no notion of which tables exist on the instance it is running on, and the gap will be a different set on every customer instance.

| Change | Detail |
|---|---|
| Offline catalog | `src/commands/catalog.js`, 2,350 ITOM-relevant tables (MID Server, Discovery, Patterns, CMDB and CI classes, Cloud, Credentials) generated from the export. Instant local matching: `cmdb_ci_vm_inst` now resolves with no network. Regenerate from any export with `python3 tools/build-catalog.py <file>`. |
| Per-instance verification | Before anything local is shown as a result, its table name is checked against that instance's `sys_db_object` in one `nameIN` query (chunks of 60). Live search results are real by definition and skip the check. |
| Existence cache | Per host in `chrome.storage.local`: confirmed tables and confirmed-missing tables. Missing entries expire after 7 days so a newly installed plugin appears. Only unknown names ever hit the network. |
| Applied everywhere | Curated shortcuts, catalog, related-record chain, sys_id candidates (a 404 marks the table missing for that host). |
| Degradation | If `sys_db_object` is not readable, unknown tables are treated as existing rather than hiding everything. |

Not changed: the curated list itself. It was already correct for this instance. CSM tables stay in the chain and candidate lists because they are right on customer instances and now hide themselves where absent.

Cost: the catalog adds ~115 KB to the content script. Measured parse cost was not possible in the build sandbox; if first-open feels slower on a heavy Workspace page, the catalog is the first thing to lazy-load.

## 0.2.1 - brand row, 14/09/2026

- New header line above the search input: app icon (18px) and "NowJump" at 13px/500 on the left, "developed by Joao Gomes" at 7px on the right. Box mirrors the footer (8px 14px padding, hairline border); the 13px name makes it ~2px taller than the footer by design.
- Artwork supplied as a PNG on a dark background; the background was removed by flood fill from the corners so the magnifier strokes inside the white area survive. Toolbar icons regenerated from the same artwork on a dark rounded square.
- `icons/brand.png` is exposed via `web_accessible_resources`, scoped to `*.service-now.com` only.

## 0.3.0 - store release candidate, 17/09/2026

| Change | Detail |
|---|---|
| Record numbers for every task type | Prefix map: INC, CHG, CTASK, PRB, PTASK, RITM, REQ, SCTASK, TASK, DUP, CMDBTASK, RECOMP, DMND, GSTASK, STRY, KB, plus the non-task Alert (em_alert) and DIS (discovery_status). Unknown prefixes fall back to `task`, which resolves any task-derived class through `sys_class_name`. "Alert" keeps the platform's casing. A miss now says which tables were tried. |
| CS removed | `CS`/`CSTASK` prefixes and all `sn_customerservice_*` references removed from candidates, chains and docs. The tool is going to customers; CSM cases are ServiceNow-internal. |
| Custom instance domains | Settings section to add a hostname or `*.suffix`. Chrome prompts for that exact origin (`optional_host_permissions`); on grant the service worker registers the bundled content scripts for it with `chrome.scripting`. Remove revokes the permission. Clear-all revokes every custom domain. |
| Catalog refreshed | Rebuilt from the new export (7,752 tables incl. SAM Pro) merged with the previous one: 2,477 entries. Selection is now inheritance-aware - every descendant of Task and Configuration Item is included - plus Event Management and SAM prefixes. |
| New shortcuts and chains | Alerts, Events, Alert Management Rules, CI Severity Tasks, CMDB Data Management Tasks, Multisource Recompute Tasks, Incidents, Change Requests, All Tasks, Software Subscriptions. Chains for em_alert, change_request/change_task, and duplicate task → its duplicate CIs (reads the list field). |
| Store compliance | MV3, permissions `storage` + `scripting` only, explicit `extension_pages` CSP, no `web_accessible_resources` (icon inlined), no `innerHTML`, no external hosts. Automated audit in `test/run.js`. `PRIVACY.md` and `docs/STORE-LISTING.md` added with permission justifications and data-use answers. |

Still yours before submission: real-instance screenshots, one end-to-end run of the custom-domain flow, hosting the privacy policy, and the SNX-16 sign-off which now matters more since the audience is external.
