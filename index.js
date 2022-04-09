"use strict";

const path = require('path');
const fs = require('fs');
const cwd = process.cwd();

const {Octokit} = require('@octokit/rest');

let verbose;

function consoleLog(x) {
    return (verbose) ? console.log(x) : false;
}

module.exports = class NodePreGypGithub {
    constructor() {
        this.stage_dir = path.join(cwd, 'build', 'stage');
    }

    init() {
        const token = process.env.NODE_PRE_GYP_GITHUB_TOKEN;
        if (!token) {
            throw new Error('NODE_PRE_GYP_GITHUB_TOKEN environment variable not found');
        }

        this.package_json = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));

        if (!this.package_json.repository || !this.package_json.repository.url) {
            throw new Error('Missing repository.url in package.json');
        } else {
            const ownerRepo = this.package_json.repository.url.match(/https?:\/\/([^\/]+)\/(.*)(?=\.git)/i);
            if (!ownerRepo) {
                throw new Error('A correctly formatted GitHub repository.url was not found within package.json');
            }

            this.host = 'api.' + ownerRepo[1];
            const [owner, repo] = ownerRepo[2].split('/');
            this.owner = owner;
            this.repo = repo;
        }

        const hostPrefix = 'https://' + this.host + '/' + this.owner + '/' + this.repo + '/releases/download/';
        if(!this.package_json.binary || 'object' !== typeof this.package_json.binary || 'string' !== typeof this.package_json.binary.host){
            throw new Error('Missing binary.host in package.json');
        }
        else if (this.package_json.binary.host.replace('https://','https://api.').substr(0, hostPrefix.length) !== hostPrefix){
            throw new Error('binary.host in package.json should begin with: "' + hostPrefix + '"');
        }

        this.octokit = this.createOctokitInstance(token);
    }

    createOctokitInstance(token) {
        return new Octokit({
            baseUrl: 'https://' + this.host,
            auth: token,
            headers: {
                "user-agent": (this.package_json.name) ? this.package_json.name : "node-pre-gyp-github"
            }
        });
    }

    async createRelease(args) {
        const options = {
            host: this.host,
            owner: this.owner,
            repo: this.repo,
            tag_name: this.package_json.version,
            target_commitish: 'master',
            name: 'v' + this.package_json.version,
            body: this.package_json.name + ' ' + this.package_json.version,
            draft: true,
            prerelease: false
        };

        Object.keys(args).forEach(function(key) {
            if(args.hasOwnProperty(key) && options.hasOwnProperty(key)) {
                options[key] = args[key];
            }
        });

        const release = await this.octokit.rest.repos.createRelease(options);
        return release;
    }

    async uploadAssets() {
        consoleLog("Stage directory path: " + path.join(this.stage_dir));

        const files = fs.readdirSync(path.join(this.stage_dir));
        if(!files.length) throw new Error('No files found within the stage directory: ' + this.stage_dir);

        for (const file of files) {
            if (this.release && this.release.assets) {
                const asset = this.release.assets.filter(element => element.name === file);
                if (asset.length) {
                    throw new Error("Staged file " + file + " found but it already exists in release " + this.release.tag_name + ". If you would like to replace it, you must first manually delete it within GitHub.");
                }
            }

            consoleLog(`Staged file ${file} found - proceeding to upload`);

            const filePath = path.join(this.stage_dir, file);
            const fileContents = fs.readFileSync(filePath);

            await this.octokit.rest.repos.uploadReleaseAsset({
                owner: this.owner,
                repo: this.repo,
                release_id: this.release.id,
                name: file,
                data: fileContents
            });
            consoleLog('Staged file ' + file + ' saved to ' + this.owner + '/' +  this.repo + ' release ' + this.release.tag_name + ' successfully.');
        }
    }

    async publish(options = {}) {
        verbose = (typeof options.verbose === 'undefined' || options.verbose) ? true : false;

        await this.init();

        const {data} = await this.octokit.rest.repos.listReleases({
            owner: this.owner,
            repo: this.repo
        });

        // when remote_path is set expect files to be in stage_dir / remote_path after substitution
        if (this.package_json.binary.remote_path) {
            options.tag_name = this.package_json.binary.remote_path.replace(/\{version\}/g, this.package_json.version);
            this.stage_dir = path.join(this.stage_dir, options.tag_name);
        } else {
            // This is here for backwards compatibility for before binary.remote_path support was added in version 1.2.0.
            options.tag_name = this.package_json.version;
        }

        const release = data.filter(element => element.tag_name === options.tag_name);

        if (release.length === 0) {
            const release = await this.createRelease(options);
            this.release = release.data;
            if (this.release.draft) {
                consoleLog(`Release ${this.release.tag_name} not found, so a draft release was created. YOU MUST MANUALLY PUBLISH THIS DRAFT WITHIN GITHUB FOR IT TO BE ACCESSIBLE.`);
            } else {
                consoleLog(`Release ${this.release.tag_name} not found, so a new release was created and published.`);
            }
        } else {
            this.release = release[0];
        }

        await this.uploadAssets();
    }
};
