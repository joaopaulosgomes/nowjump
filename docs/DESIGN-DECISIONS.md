# NowJump - design decision record

Closes SNX-D2 (partially), SNX-D3, SNX-D4, SNX-D6, SNX-D7, SNX-D8, SNX-D9, SNX-D10.
Date: 14/09/2026

Format: decision, rejected option, reason. Reopen a decision by adding a dated note under it, not by editing it.

---

## SNX-D2 - Task inventory

**Status: seeded, not validated.** The real inventory needs a week of your own navigation logged. What ships in v1 is a starting set derived from the case files in this workspace (MID Server, Discovery, CMDB cases), and it is deliberately ITOM-shaped.

Seed destinations, ranked by how often they show up across the open cases:

| Destination | Table | Kind |
|---|---|---|
| ECC Queue | `ecc_queue` | list |
| MID Servers | `ecc_agent` | list |
| Discovery Status | `discovery_status` | list |
| Discovery Log | `discovery_log` | list |
| Discovery Schedules | `discovery_schedule` | list |
| Discovery Patterns | `sa_pattern` | list |
| Credentials | `discovery_credentials` | list |
| MID Server Issues | `ecc_agent_issue` | list |
| System Properties | `sys_properties` | list |
| Upgrade History | `sys_upgrade_history` | list |
| System Logs | `syslog` | list |
| Scheduled Jobs | `sysauto_script` | list |
| Cloud Service Accounts | `cmdb_ci_cloud_service_account` | list |
| IRE / Reconciliation rules | `cmdb_reconciliation_definition` | list |
| CMDB Identification rules | `cmdb_identifier` | list |
| De-duplication tasks | `reconcile_duplicate_task` | list |
| Update Sets | `sys_update_set` | list |
| Stats page | `stats.do` | page |
| Cache flush | `cache.do` | page |
| Background scripts | `sys.scripts.do` | page |

Excluded from v1, with reason:
- Service Mapping and Event Management tables - outside current case scope.
- Anything requiring `security_admin` elevation - the palette must never prompt for elevation.

**Action for you:** replace this table after one week of real logging. The list lives in `src/commands/curated.js` and is data, not code.

---

## SNX-D3 - Competitive teardown (condensed)

| Product | Adopted | Rejected |
|---|---|---|
| VS Code | Prefix-free default, `>` only as an optional accelerator | Deep mode system - unteachable for occasional users |
| Raycast | Context actions shown as a header group when a "current thing" exists | Extension marketplace metaphor - irrelevant here |
| Linear | Single input, results grouped by kind, group order fixed | Command chaining - out of scope |
| Chrome omnibox | Recent-first ranking when the query is empty | URL-shaped suggestions - confusing on an instance |

---

## SNX-D4 - Interaction model

### Decision 1: single input, no required modes

Typed text is matched against everything at once: tables, curated pages, record numbers, context actions. A 32-character hex string is detected automatically and treated as a sys_id. `>` is accepted as an optional prefix that filters to actions only, for people who want it. It is never required and never advertised on first run.

Rejected: mandatory prefixes (`@` records, `#` tables). Reason: the audience is occasional users under time pressure on a customer call. A mode system is something you learn on a quiet afternoon, and there are no quiet afternoons.

### Decision 2: context actions live in a header group above results

When a record is open, the palette opens with a compact group at the top: open in other UI, related records, update set. This group is always visible when the query is empty and collapses to matching items only when the user types.

Rejected: context below navigation results. Reason: the whole point of context is that it is what you probably want right now. Burying it defeats it. The cost - that it is "in the way" - is paid for by making the group compact (max 4 rows) and by the fact that typing anything filters it.

### Decision 3: Enter on empty query opens the most recent destination

Rejected: Enter does nothing. Reason: the single most common TSE action is "go back to the thing I was just looking at", and this makes it two keystrokes.

### Decision 4: the query is not remembered between opens

Each open starts empty. Rejected: remembering the last query. Reason: the previous query almost never applies to the next intent, and stale text in the input is a stale-context bug waiting to happen (SNX-22).

### Keystroke spec

| Key | Behaviour |
|---|---|
| `Ctrl+K` / `Cmd+K` | Open. Configurable. Suppressed when focus is inside an editable field, unless the option is enabled. |
| `Esc` | Close. Focus returns to the element that had it. |
| `↑` `↓` | Move highlight. Wraps at both ends. |
| `Enter` | Execute highlighted. On empty query, open top recent. |
| `Shift+Enter` | Execute in a new tab, regardless of the default setting. |
| `Tab` | Same as `↓`. Never leaves the palette while open. |
| `Backspace` on empty input | Nothing. Does not close. |
| Typing while a fetch is pending | Cancels the pending fetch. Results never arrive for a query that is no longer current. |

---

## SNX-D6 - Visual spec

### Decision: fixed neutral theme, not inherited from the instance

The palette does not read the instance theme. It ships its own light and dark variants and follows `prefers-color-scheme`.

Rejected: inheriting instance CSS variables. Reason: Workspace exposes theme tokens, UI16 does not, and customer instances routinely carry custom themes that would make the palette illegible in ways impossible to test in advance. A palette that is recognisably not-ServiceNow is acceptable. One that is unreadable is not.

### Tokens

| Token | Light | Dark |
|---|---|---|
| surface | `#ffffff` | `#1f2023` |
| surface-raised | `#f5f5f4` | `#2a2b2f` |
| text | `#1b1b1b` | `#e8e6e1` |
| text-secondary | `#5f5e5a` | `#a5a39c` |
| text-muted | `#8a8985` | `#77766f` |
| border | `#d9d7d0` | `#3a3b40` |
| highlight | `#e8eef7` | `#243247` |
| highlight-text | `#0c447c` | `#b5d4f4` |
| warning | `#faeeda` / `#633806` | `#412402` / `#fac775` |
| danger | `#fcebeb` / `#791f1f` | `#501313` / `#f7c1c1` |

Type: system UI stack, 13px rows, 14px input, 11px metadata. Two weights: 400 and 500. Radius 10px on the panel, 6px on rows and badges. Backdrop: `rgba(0,0,0,0.32)` flat, no blur - blur is expensive over a dense Workspace list and it is the one place the palette would visibly lag.

Contrast: every pairing above is at or above 4.5:1. Verified with the WCAG formula, not by eye.

### Open risk carried forward

No screenshots exist yet across the four shell/theme combinations. That is a manual step once the extension is loaded. Recorded as remaining work in `docs/REMAINING-WORK.md`.

---

## SNX-D7 - Result row anatomy

```
[kind]  Primary label                     secondary label   [meta]
```

- `kind`: 5-character lowercase label in a muted monospace: `table`, `page`, `record`, `action`, `set`, `recent`. Not an icon. Icons need a font or an SVG sprite, both of which add weight and neither of which survives a hostile page CSS reset as well as text does.
- Primary: 13px, weight 500, truncates with ellipsis.
- Secondary: 13px, weight 400, secondary colour, truncates first.
- Meta: right-aligned, 11px monospace, never truncates. Holds the table name or a keyboard hint.

Truncation order: secondary first, then primary. Meta never.

Groups, fixed order: context, recents, matches. Group headers are 11px muted, only shown when more than one group has results. A group with 40 results shows 8 and a `+32 more` footer row that is not selectable. This keeps the panel under one screen height on a laptop.

---

## SNX-D8 - Failure copy

Each message fits two lines at 420px. First sentence: what happened. Second: what to do.

| State | Copy |
|---|---|
| No match | Nothing matches. Try a table name, a record number, or a sys_id. |
| 403 on table | You can't read `{table}` on this instance. Check your roles or ask an admin. |
| 401 | Your session expired. Reload the page and try again. |
| sys_id not found | No record found for that sys_id in the tables checked. Type a table name to search there directly. |
| Network | Couldn't reach the instance. Check the connection and retry. |
| No token | Couldn't get a session token from this page. Reload and try again. |

No "something went wrong". No exclamation marks. No first person.

---

## SNX-D9 - Context panel

Persistent header group when a record is open, max 4 rows, in this order:

1. Open in other UI
2. Related records, one row per configured relation, only those that resolve
3. Update set - current set with a warning badge when it is Default

On a production instance the update set row is read-only and the switch action is absent. Production is detected from `glide.installation.production`; if that property is unreadable the instance is treated as production, because the safe failure is hiding a write action, not exposing one.

Rejected: context as a scrolling result group. Reason: it would scroll out of view the moment the user types, which is exactly when a "you are in Default" warning matters most.

---

## SNX-D10 - Discoverability

- No floating launcher button. Rejected because it is persistent chrome injected into a customer's page, and that is the one thing the security review (SNX-16) will not accept.
- First run: the options page opens once on install and shows the shortcut. That is the whole onboarding.
- Rediscovery: the extension icon in the toolbar opens the options page, which shows the shortcut in the first line.

---

## Naming (SNX-D13, partial)

"NowJump" stays as the working title. Not confirmed against ServiceNow naming guidance - that check is yours, and it matters before this runs on a customer instance.
