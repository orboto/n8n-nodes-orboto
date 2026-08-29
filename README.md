# n8n-nodes-orboto

[n8n](https://n8n.io) community nodes for [orboto](https://orboto.example.com) - automate tickets, milestones, projects and docs from your workflows.

> Status: scaffold. Nodes and credentials land here ticket by ticket; watch [releases](../../releases) for the first published version.

## Installation

Install via the n8n UI: **Settings > Community nodes > Install** - enter `n8n-nodes-orboto`.

Or install manually in your n8n user folder (`.n8n` by default):

```bash
npm install n8n-nodes-orboto
```

Community nodes are enabled by default on n8n Cloud and self-hosted instances.

## Usage

Once installed, the orboto nodes appear in the node panel. Connect them with an orboto credential (API key) pointing at your orboto instance - for example `https://orboto.example.com`.

- **orboto** action nodes: tickets, milestones, projects, docs/wiki, time entries, users, labels, saved searches and more.
- **orboto Trigger**: starts a workflow when events happen in orboto (ticket created, moved, commented, ...).

Example workflows ship in [`examples/`](examples/) once the first nodes are published.

## Compatibility

- n8n version: 1.x and 2.x
- Node.js (running n8n): >= 20.19
- Node.js (building this package): >= 22 (n8n's expression-runtime dev dependency requires it; the published package itself has no runtime dependencies)

## Development

```bash
npm install     # install dependencies
npm run build   # compile TypeScript to dist/ + copy icons
npm run lint    # ESLint (includes n8n community-node package rules)
npm test        # unit tests (vitest)
npm run format  # prettier
```

To try your local build in n8n, link or copy this folder into your n8n user folder's `nodes` directory and restart n8n.

## License

[MIT](LICENSE)
