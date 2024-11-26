const cp = require('child_process');

const PACKAGED_FILE = './' + process.env.npm_package_name + '-' + process.env.npm_package_version + '.vsix';
const PROFILE_NAME = process.env.vscode_profile || 'vscode-ext';
const CODE_NAME = process.env.vscode_name || 'code-insiders';
cp.exec(`${CODE_NAME} --install-extension ${PACKAGED_FILE} --profile ${PROFILE_NAME}`, { cwd: process.cwd() }, (err, stdout, stderr) => {
	if (err) {
		console.log('ERROR:');
		console.log(err);
		process.exit(1);
	} else {
		console.log(stderr + stdout);
	}
});
