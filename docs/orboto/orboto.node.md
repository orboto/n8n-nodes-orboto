# orboto node

The **orboto** action node automates an [orboto](https://orboto.io) instance from n8n: tickets, milestones, projects, docs/wiki, time entries, users, labels, saved searches and the agent inbox.

## Credentials

Authenticate with either credential:

- **orboto API**: base URL + API key (**Settings > API Keys** in orboto). Includes a connection test.
- **orboto OAuth2 API**: static OAuth client (**Admin > OAuth clients** in orboto), PKCE by default, `api offline_access` scope, automatic token refresh.

## Resources and operations

### Ticket

- **Create** - title plus any fields; *Allow Language Mismatch* overrides the project's 422 language enforcement, *Allow Duplicate* + justification overrides the 409 duplicate block. The response includes `languageWarning` and `similarWarnings` whenever orboto sets them.
- **Get** - by key (`ONN-42`), number (`42`) or id.
- **Get Many** - filters (status category, assignee, milestone, parent, full-text search), **Return All** walks cursor pagination, or a **Limit**.
- **Update** - add fields under **Update Fields**; only the fields added there are sent, so untouched values (type, priority, delivery mode, ...) are never reset by a form default. Booleans added explicitly can also be cleared again. Language override available.
- **Delete** - permanent; a 423 response means legal hold.
- **Move (Change Status)** - picks a concrete status from the project's status list.
- **Assign / Unassign** - project members.
- **Comment** - Markdown, internal flag.
- **Log Time** - minutes, description, logged-at.
- **Add Label / Remove Label**.
- **OQL Query** - free-text OQL (or JQL) over `POST /query`, paginated.
- **Set/Clear Milestone, Set/Clear Version**.
- **Dependencies** - add, remove, list.
- **Checklists** - add item, check, uncheck.
- **Attachments** - add (uploads an n8n binary property as multipart), list.
- **Bulk Update** - status/milestone/assignee/due date/version/priority across many ticket ids.

### Milestone

Create, Get (key or id), Get Many (optional closed), Update, Close.

### Project

Create, Get, Get Many, Update, **Get Primer Facts** (the structured context-pack facts), **Get AI Primer** (the generated markdown pack).

### Doc

Create, Get (by doc key or id), Get Many in a space, Update, **Ask Docs** (RAG over the wiki; returns answer + citations when the instance has an embedding provider, a clear message otherwise), **Ingest URL** (creates a doc from a web page).

### Time Entry

Ticket-scoped: Log, Get Many, Edit, Delete.

### User

**Get Project Members** - the orboto API has no global user list; pickers and directory reads are project-scoped.

### Label

Create, Get Many.

### Saved Search

Create, Get Many, Run (executes OQL/JQL saved searches; legacy-format searches are rejected with a clear message).

### Agent

The n8n-to-AI-agent bridge:

- **Notify** - send a message to an agent identity (`targetEmail`, subject, kind info/request/complete/error, JSON payload, thread chaining, project scope, sender reference).
- **Get Messages** - the agent inbox (include delivered, limit, project scope, exclude own sender reference).
- **Ack Messages** - acknowledge by ids.

## Rate limits

orboto allows 600 requests/minute per instance. Prefer bulk operations, and enable **Continue On Fail** on nodes that fan out over many items so throttled items surface as error items instead of aborting the run.
