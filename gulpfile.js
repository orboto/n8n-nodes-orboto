const { src, dest } = require('gulp');

/**
 * Copies node/credential icons (SVG) from the source tree into `dist/`,
 * preserving the directory layout - the layout n8n expects after a plain
 * `tsc` compile. Icon paths referenced by node descriptions (e.g.
 * `file:orboto.svg`) resolve against these copies.
 */
function buildIcons() {
	return src(['nodes/**/*.svg', 'credentials/**/*.svg'], { allowEmpty: true }).pipe(dest('dist'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
