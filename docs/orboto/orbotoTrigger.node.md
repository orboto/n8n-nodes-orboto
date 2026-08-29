# orboto Trigger node

The **orboto Trigger** starts a workflow when events happen in an [orboto](https://orboto.example.com) project.

## Setup

1. Select the **project** and the **events** to subscribe to.
2. Connect an **orboto API** or **orboto OAuth2 API** credential.
3. Activate the workflow. The node registers a webhook in orboto automatically (visible under the project's webhooks); deactivating the workflow removes it.

Registration uses the default orboto payload format - the only format orboto HMAC-signs.

## Events

| Event | Fires when |
| --- | --- |
| `ticket.created` / `ticket.updated` / `ticket.deleted` | a ticket changes |
| `ticket.ready` | a ticket becomes unblocked and actionable (wake-on-unblock) |
| `ticket.checklist_item.completed` | a checklist item is checked |
| `comment.created` / `comment.updated` / `comment.deleted` | comments change |
| `project.member_added` / `project.member_removed` | membership changes |
| `milestone.created` / `milestone.updated` | milestones change |
| `version.released` | a version is released |
| `symphony.candidates_changed` | the Symphony candidate set changes |
| `inbound.signal.received` | an inbound integration signal arrives |
| `agent.escalation_raised` | an agent session escalates (collision, failed checks, review rejected, missing decision, git failure) |

Newer orboto versions may emit additional events - list them comma-separated under **Additional Events**.

## Security

- Every delivery must carry `X-Orboto-Signature: sha256=<hmac-sha256-of-body>` matching the webhook secret created at registration. Unsigned or forged deliveries are rejected with HTTP 401.
- Deliveries for events you did not select are ignored.
- The secret is stored in the workflow's node data and re-validated on re-registration; a lost secret (for example after a workflow move) triggers automatic re-registration with a fresh secret.

## Output

Each delivery emits one item: the event payload as sent by orboto, plus the event name under `event` when the payload does not already carry it.

## Requirements

orboto must be able to reach your n8n instance over HTTP(S). When n8n runs behind a proxy or in Docker, set `N8N_WEBHOOK_URL` (formerly `WEBHOOK_URL`) to the publicly reachable base URL.
