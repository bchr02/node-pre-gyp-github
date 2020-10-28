import path from 'path';
import {promises as fs} from 'fs';
import mime from 'mime-types';
import pMap from 'p-map';
import pupa from 'pupa';
import readPkg from 'read-pkg';
import parseGithubUrl from 'parse-github-url';
import {Octokit} from '@octokit/rest';

const getReleaseByTag = async (octokit: Octokit, {owner, repo, tag}: {owner: string; repo: string; tag: string}) => {
	try {
		const {data} = await octokit.repos.getReleaseByTag({
			owner,
			repo,
			tag
		});

		return data;
	} catch (error) {
		if (error?.name! === 'HttpError' && error?.status! === 404) {
			return;
		}

		throw error;
	}
};

const uploadAssets = async (octokit: Octokit, {stagingDirectory, assets, updateStatus, tag, owner, repo, releaseId}: {
	stagingDirectory: string;
	assets: string[];
	updateStatus: (status: string) => unknown;
	tag: string;
	owner: string;
	repo: string;
	releaseId: number;
}) => {
	const files = await fs.readdir(stagingDirectory);

	if (files.length === 0) {
		throw new Error(`No files found in: ${stagingDirectory}`);
	}

	await pMap(files, async file => {
		if (assets.includes(file)) {
			throw new Error(`${file} already exists in release ${tag}. If you would like to replace it, you must first manually delete it on Github.`);
		}

		updateStatus(`Uploading ${file}`);

		await octokit.repos.uploadReleaseAsset({
			owner,
			repo,
			release_id: releaseId,
			data: await fs.readFile(path.resolve(stagingDirectory, file)),
			headers: {
				'Content-Type': mime.contentType(file) || 'application/octet-stream'
			}
		});

		updateStatus(`${file} uploaded to ${owner}/${repo}@${tag} successfully.`);
	});
};

export = async (options: {
	githubAuth: any;
	release?: boolean;
}, updateStatus?: (status: string) => unknown) => {
	options = {
		release: false,
		...options
	};

	const packageJson = await readPkg();

	if (!packageJson?.repository?.url) {
		throw new Error('Missing repository url in package.json');
	}

	const {host, owner, name: repo}: {host: string; owner: string; name: string} = parseGithubUrl(packageJson.repository.url);

	const hostPrefix = `https://${host}/${owner}/${repo}/releases/download`;

	if (!packageJson?.binary?.host) {
		throw new Error('binary.host is missing in the package.json');
	}

	if (packageJson.binary.host.replace('https://', 'https://api.').slice(0, hostPrefix.length) !== hostPrefix) {
		throw new Error(`binary.host in the package.json should begin with: ${hostPrefix}`);
	}

	const tag = packageJson?.binary?.remote_path ? pupa(packageJson.binary.remote_path, {
		version: packageJson.version
	}) : packageJson.version;

	const stagingDirectory = path.join(process.cwd(), 'build', 'stage', tag);
	updateStatus?.(`Found staging path: ${stagingDirectory}`);

	const octokit = new Octokit({
		baseUrl: `https://api.${host}`,
		auth: options.githubAuth
	});

	const releaseInfo = await getReleaseByTag(octokit, {
		owner,
		repo,
		tag
	});

	if (releaseInfo) {
		await uploadAssets(octokit, {
			stagingDirectory,
			updateStatus,
			tag,
			owner,
			repo,
			assets: releaseInfo.assets.map(({name}) => name),
			releaseId: releaseInfo.id
		});
	} else {
		const {data} = await octokit.repos.createRelease({
			owner,
			repo,
			tag_name: tag,
			name: `v${packageJson.version}`,
			body: `${packageJson.name} ${packageJson.version}`,
			draft: true
		});
		const releaseId = data.id;

		await uploadAssets(octokit, {
			stagingDirectory,
			updateStatus,
			tag,
			owner,
			repo,
			assets: [],
			releaseId
		});

		if (options.release) {
			await octokit.repos.updateRelease({
				owner,
				repo,
				release_id: releaseId,
				draft: false
			});

			updateStatus(`${owner}/${repo}@${tag} was just published.`);
		} else {
			updateStatus(`${owner}/${repo}@${tag} was just published as a draft. In order to make it accessibly, manually publish it within Github.`);
		}
	}
};
