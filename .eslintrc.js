module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'n8n-nodes-base'],
	extends: ['plugin:n8n-nodes-base/nodes', 'plugin:n8n-nodes-base/credentials'],
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
				// ONN-2 ships the package scaffold and the shared REST client only;
				// the first node registers with ONN-5, the first credential with ONN-3.
				'n8n-nodes-base/community-package-json-n8n-nodes-empty': 'off',
			},
		},
	],
};
