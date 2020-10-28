#!/usr/bin/env node

import meow from 'meow';
import updateNotifier from 'update-notifier';
import nodePreGypGithub from '.';

const {input, flags, pkg, showHelp} = meow(`
    Usage
      $ node-pre-gyp-github publish
 
    Options
	  --release  If a release is created don't mark it as a draft after the assets have finished uploading.
	  --silent   Whether to log all status updates. Errors will always show.
 
    Examples
	  $ node-pre-gyp-github publish
	  ...
      Richienb/the-module@1.0.0 was just published.
`, {
	flags: {
		release: {
			type: 'boolean',
			default: false
		},
		silent: {
			type: 'boolean',
			default: false
		}
	}
});

const [action] = input;

const getGithubAuthentication = () => {
	const token = process.env.NODE_PRE_GYP_GITHUB_TOKEN;
	if (!token) {
		throw new Error('NODE_PRE_GYP_GITHUB_TOKEN environment variable not found');
	}

	return token;
};

(async () => {
	if (action === 'publish') {
		await nodePreGypGithub({
			githubAuth: getGithubAuthentication()
		}, status => {
			if (!flags.silent) {
				console.log(status);
			}
		});
	} else {
		showHelp();
	}

	updateNotifier({pkg}).notify();
})();
