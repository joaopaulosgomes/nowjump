# NowJump - Privacy Policy

Last updated: 17/09/2026

NowJump is a browser extension that adds a keyboard command palette to ServiceNow instances you already have access to.

## What NowJump does with data

- NowJump runs only on pages of ServiceNow instances: `*.service-now.com` by default, plus any instance domain you add yourself in the extension settings and approve in Chrome's permission prompt.
- On those pages it reads the current URL to understand which record or list is open, and calls that same instance's REST API using your existing browser session, exactly as the page itself does. Requests go only to the instance you are on.
- It stores, on your device only (`chrome.storage.local`): your settings, the custom domains you added, and per instance a short list of recent destinations - table names, record identifiers (sys_ids), display labels, use counts and timestamps. It never stores record field values, credentials, or page content.

## What NowJump does not do

- No data is sent to the developer or to any third party. There is no analytics, telemetry, crash reporting or remote configuration.
- No data is synced between devices.
- No code is downloaded or executed at runtime. Everything runs from the files shipped in the extension package.
- NowJump does not read, modify or store data from any website other than the instance domains it is enabled on.

## Your control

- Settings > Stored data > "Clear all stored data" removes everything NowJump has saved and revokes any custom domain permissions.
- Removing the extension deletes all of its stored data.

## Contact

Joao Gomes - open an issue in the project repository or use the contact address on the Chrome Web Store listing.
