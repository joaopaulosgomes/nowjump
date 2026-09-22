# NowJump

A keyboard command palette for ServiceNow. Press `Ctrl+K` (or `Cmd+K`) on any instance page, type a table name, record number or sys_id, press Enter. When a record is open, the palette also offers: open it in the other UI, jump to related records, and see or switch the active update set.

Zero instance-side configuration. No update sets, no plugins, no telemetry. Works on UI16, Next Experience and workspaces.

## Custom instance domains

`*.service-now.com` works out of the box. If your instance has its own domain, open the extension settings, add the hostname (or `*.example.com`), and accept Chrome's permission prompt. Reload the instance tab. Remove revokes the permission.

## Install (unpacked, for personal use)

1. Download and unzip `nowjump-0.1.0.zip`.
2. Chrome > `chrome://extensions` > enable Developer mode (top right).
3. Load unpacked > select the unzipped `nowjump` folder.
4. The settings page opens once. It shows the shortcut. That is the whole onboarding.
5. Open any `*.service-now.com` page and press `Ctrl+K`.

To update: replace the folder contents, then click the reload icon on the extension card.
To remove: Remove on the extension card. Stored recents go with it.

## What it does

| You type | You get |
|---|---|
| `ecc` | ECC Queue, MID Servers, MID Issues - curated ITOM shortcuts, then live matches from `sys_db_object` |
| `INC0010001`, `DUP0001001`, `DIS0016339`, `Alert0010003` | The record. Any task type by prefix (INC, CHG, CTASK, PRB, RITM, REQ, SCTASK, TASK, DUP, CMDBTASK, RECOMP, DMND, GSTASK), plus alerts and Discovery status runs |
| a 32-char sys_id | The record, tried against your recent tables first then a curated candidate list |
| `u_my_custom_table` | A direct jump even if nothing else matches |
| `>` | Only actions for the open record |
| nothing, then Enter | Your most recent destination |

Shift+Enter opens in a new tab. Esc closes and returns focus to where it was.

## What it stores

`chrome.storage.local` only, keyed per instance hostname: table names, sys_ids, labels, use counts, timestamps, and your settings. Never record content. Never synced. Nothing leaves the browser - the extension makes no requests to any host other than the instance you are on.

## Layout

```
manifest.json          MV3, permissions: storage; host: https://*.service-now.com/*
src/bridge.js          MAIN-world script: hands g_ck and user id to the content script on request
src/content.js         controller: shortcut, context resolution, search orchestration, execution
src/palette.js         UI in a closed shadow root, keyboard-first, own neutral theme
src/lib/context.js     URL -> {shell, table, sysId}; URL builders. Pure, unit tested
src/lib/match.js       fuzzy score + frecency ranking. Pure, unit tested
src/lib/store.js       chrome.storage.local wrapper, per-host
src/lib/api.js         Table API wrapper, typed errors, abort, one-retry-on-network
src/commands/curated.js  curated destinations (data - replace after your logging week)
src/commands/chain.js    related-record relations per table (data)
src/commands/registry.js command producers: search, context, update set
options/               settings page
test/                  node tests: run.js, registry.test.js, palette.test.js
docs/                  design decisions, remaining work
```

## Tests

```
npm install jsdom@24     # only needed for palette.test.js
node test/run.js
node test/registry.test.js
node test/palette.test.js
```

## Known limits

- Workspace list pages do not expose the table in the URL, so context is "workspace, no record" there.
- Update set switching uses the header picker endpoint first and falls back to writing `sys_user_preference`. The picker endpoint is the one the platform's own header uses, but it is not a documented public API. If it changes, the fallback path still works.
- sys_id resolution only tries tables in `SYS_ID_CANDIDATES` plus your recents. Add tables there if your work lives elsewhere.
- Not validated against customer instances. See `docs/REMAINING-WORK.md` and `docs/STORE-LISTING.md` before publishing.
- Privacy policy: `PRIVACY.md`.
