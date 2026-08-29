module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'n8n-nodes-base'],
	extends: ['plugin:n8n-nodes-base/nodes', 'plugin:n8n-nodes-base/credentials'],
	rules: {
		// The brand is lowercase everywhere (operator override, 2026-08-29): the
		// display name must render as "orboto API", which the title-case rule
		// rejects (its exception list predates brand-lowercase packages).
		'n8n-nodes-base/cred-class-field-display-name-miscased': 'off',
		// Main-repo-only rule misfiring on community packages: it camelCases the
		// URL *value*, which would corrupt a GitHub readme link.
		'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
		// Same brand override: the node class and file are lowercase 'orboto'
		// (matching description.name), which this rule's title-case heuristic
		// rejects. Reported to the coordinator instead of reverting.
		'n8n-nodes-base/node-filename-against-convention': 'off',
	},
	env: {
		node: true,
		es2022: true,
	},
	overrides: [
		{
			files: ['package.json'],
			parser: 'jsonc-eslint-parser',
			extends: ['plugin:n8n-nodes-base/community'],
			rules: {
				// ONN-2 shipped the scaffold; nodes register from ONN-5 on
				// (the credential is registered since ONN-3).
				'n8n-nodes-base/community-package-json-n8n-nodes-empty': 'off',
			},
		},
	],
};
