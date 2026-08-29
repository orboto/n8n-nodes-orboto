# n8n-nodes-orboto

[n8n](https://n8n.io) community nodes for [orboto](https://orboto.example.com) - automate tickets, milestones, projects, docs and more from your workflows.

[![CI](https://github.com/orboto/n8n-nodes-orboto/actions/workflows/ci.yml/badge.svg)](https://github.com/orboto/n8n-nodes-orboto/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-orboto.svg)](https://www.npmjs.com/package/n8n-nodes-orboto)

## Installation

Install via the n8n UI: **Settings > Community nodes > Install** - enter `n8n-nodes-orboto`.

Or install manually in your n8n user folder (`.n8n` by default):

```bash
cd ~/.n8n/custom
npm install n8n-nodes-orboto
```

Restart n8n afterwards. Community nodes are enabled by default on n8n Cloud and self-hosted instances.

## Credentials

Two credential types, both accepting a self-hosted base URL:

- **orboto API** (simplest): an API key from orboto (**Settings > API Keys**) plus your instance base URL. The connection test does an authenticated read and gives immediate feedback.
- **orboto OAuth2 API**: for instances with OAuth enabled. An administrator creates a static client under **Admin > OAuth clients** in orboto; paste its client id (and secret, if confidential) here. The default flow is PKCE with the `api offline_access` scope, so tokens refresh automatically. The authorize/token URLs are derived from the base URL (discovered at `/.well-known/oauth-authorization-server`).

Both `https://orboto.example.com` and `https://orboto.example.com/api` work as base URL.

## Nodes

### orboto

Action node covering the orboto REST API. Rate limits: 600 requests/minute per instance - prefer bulk operations and enable **Continue On Fail** for large batches.

| Resource | Operations |
| --- | --- |
| Ticket | Create, Get, Get Many (filters, Return All/Limit), Update, Delete, Move (Change Status), Assign, Unassign, Comment, Log Time, Add Label, Remove Label, OQL Query, Set/Clear Milestone, Set/Clear Version, Dependencies (Add/Remove/Get), Checklists (Add Item, Check, Uncheck), Attachments (Add multipart, Get Many), Bulk Update |
| Milestone | Create, Get, Get Many, Update, Close |
| Project | Create, Get, Get Many, Update, Get Primer Facts, Get AI Primer |
| Doc | Create, Get, Get Many, Update, Ask Docs (RAG), Ingest URL |
| Time Entry | Log, Get Many, Edit, Delete (ticket-scoped) |
| User | Get Project Members (no global user list in the orboto API) |
| Label | Create, Get Many |
| Saved Search | Create, Get Many, Run (OQL/JQL) |
| Agent | Notify, Get Messages, Ack Messages - the n8n-to-AI-agent bridge |

Ticket references accept keys (`ONN-42`), numbers (`42`) or ids everywhere. Dropdowns (project, milestone, status, member, label, version, space) load live from your instance.

Error semantics are surfaced as first-class options, not opaque failures:

- **422 language enforcement**: enable *Allow Language Mismatch* to create/update anyway; the response carries `languageWarning`.
- **409 duplicate block**: enable *Allow Duplicate* plus a required justification; `similarWarnings` land in the node output so workflows can branch.
- **423 legal hold** (delete): documented on the operation; **429 rate limit** guidance in the node description.

### orboto Trigger

Fires workflows on orboto events over the orboto webhook system:

- Auto-registers a project-scoped webhook on workflow **activation** and removes it on **deactivation** (registered with the default payload format - the only HMAC-signed one).
- Every delivery is verified against the `X-Orboto-Signature` header (sha256 HMAC, constant-time compare); unsigned or forged requests are rejected.
- Events (16, versioned with this package): `ticket.created`, `ticket.updated`, `ticket.deleted`, `ticket.ready`, `ticket.checklist_item.completed`, `comment.created`, `comment.updated`, `comment.deleted`, `project.member_added`, `project.member_removed`, `milestone.created`, `milestone.updated`, `version.released`, `symphony.candidates_changed`, `inbound.signal.received`, `agent.escalation_raised` - plus a free-text field for events from newer orboto versions.

n8n must be reachable from your orboto instance (set `WEBHOOK_URL`/`N8N_WEBHOOK_URL` when running n8n behind a proxy).

## Compatibility

- n8n version: 1.x and 2.x
- Node.js (running n8n): >= 20.19
- Node.js (building this package): >= 22

## Example workflows

Importable JSON files live in [`examples/`](examples/):

- `create-ticket-from-webhook.json` - catch an inbound webhook (e.g. a form or mail parser) and create an orboto ticket.
- `notify-on-ticket-created.json` - orboto Trigger on `ticket.created` -> post to any HTTP endpoint.
- `nightly-oql-digest.json` - Schedule Trigger -> OQL query -> aggregate digest.
- `sync-ticket-to-external.json` - two-way sync with an external system: orboto Trigger -> upsert outbound, inbound webhook -> update the orboto ticket, with a loop guard.

## Development

```bash
npm install     # install dependencies
npm run build   # compile TypeScript to dist/ + copy icons
npm run lint    # ESLint (includes n8n community-node package rules)
npm test        # unit tests (vitest)
npm run format  # prettier
```

To try your local build in n8n, install the tarball (`npm pack`) into your `.n8n/custom` folder and restart n8n.

## Releasing and the verified-community-node submission (operator steps)

Publishing and external submissions are operator-only. The package is kept submission-ready; from a clean checkout:

```bash
npm ci && npm run lint && npm run build && npm test   # all gates green
npm pack --dry-run                                   # dist/ + icons only, zero runtime deps
```

1. **Publish** (npm org account required): push a `v*` tag - the `publish` workflow runs lint/build/test and publishes with provenance. Requires the `NPM_TOKEN` secret on the repo.
2. **Verified community node submission**: check the current program rules at <https://docs.n8n.io/integrations/community-nodes/verification/> and submit `n8n-nodes-orboto` from the npm registry. Pre-verified checklist: package name convention `n8n-nodes-*` + keyword `n8n-community-node-package`; `n8n.nodes`/`n8n.credentials` registered; MIT license; no runtime dependencies; ESLint with `eslint-plugin-n8n-nodes-base` clean in CI; README + per-node docs + example workflows; tests in CI.

## License

[MIT](LICENSE)
