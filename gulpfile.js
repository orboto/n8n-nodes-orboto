const { src, dest } = require('gulp');

/**
 * Copies node/credential icons (SVG) into `dist/`, preserving the layout the
 * tsc compile produces (dist/nodes/..., dist/credentials/...). Icon paths
 * referenced by node descriptions (e.g. `file:orboto.svg`) resolve against
 * the compiled node file's directory.
 */
function buildIcons() {
	return src(['nodes/**/*.svg', 'credentials/**/*.svg'], { allowEmpty: true }).pipe(
		dest('dist/nodes'),
	);
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
