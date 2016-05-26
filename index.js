"use strict";

var request = require('request'),
	path = require("path"),
	fs = require('fs'),
	mime = require('mime'),
	GitHubApi = require("github"),
	cwd = process.cwd();

function NodePreGypGithub() {}

NodePreGypGithub.prototype.github;
NodePreGypGithub.prototype.owner;
NodePreGypGithub.prototype.repo;
NodePreGypGithub.prototype.package_json = {};
NodePreGypGithub.prototype.release = {};
NodePreGypGithub.prototype.stage_dir = path.join(cwd,"build","stage");

NodePreGypGithub.prototype.init = function() {
	var ownerRepo, hostPrefix;
	
	this.package_json = JSON.parse(fs.readFileSync(path.join(cwd,'package.json')));
	
	if(!this.package_json.repository || !this.package_json.repository.url){
		throw new Error('Error: Missing repository.url in package.json');
	}
	else {
		ownerRepo = this.package_json.repository.url.match(/github\.com\/(.*)(?=\.git)/i);
		if(ownerRepo) {
			ownerRepo = ownerRepo[1].split('/');
			this.owner = ownerRepo[0];
			this.repo = ownerRepo[1];
		}
		else throw new Error('Error: A correctly formatted GitHub repository.url was not found within package.json');
	}
	
	hostPrefix = 'https://github.com/' + this.owner + '/' + this.repo + '/releases/download/';
	if(!this.package_json.binary || 'object' !== typeof this.package_json.binary || 'string' !== typeof this.package_json.binary.host){
		throw new Error('Error: Missing binary.host in package.json, configure node-pre-gyp first');
	}
	else if (this.package_json.binary.host.substr(0, hostPrefix.length) !== hostPrefix){
		throw new Error('Error: binary.host in package.json should begin with: "' + hostPrefix + '"');
	}
	
	this.github = new GitHubApi({ // set defaults
		// required
		version: "3.0.0",
		// optional
		debug: false,
		protocol: "https",
		host: "api.github.com",
		pathPrefix: "", // for some GHEs; none for GitHub
		timeout: 5000,
		headers: {
			"user-agent": (this.package_json.name) ? this.package_json.name : "node-pre-gyp-github" // GitHub is happy with a unique user agent
		}
	});
};

NodePreGypGithub.prototype.authenticate_settings = function(){
	return {
		type: "oauth",
		token: process.env.NODE_PRE_GYP_GITHUB_TOKEN
	};
};

NodePreGypGithub.prototype.createRelease = function(args, callback) {
	var options = {
		'owner': this.owner,
		'repo': this.repo,
		'tag_name': this.package_json.version,
		'target_commitish': 'master',
		'name': 'v' + this.package_json.version,
		'body': this.package_json.name + ' ' + this.package_json.version,
		'draft': true,
		'prerelease': false
	};
	
	Object.keys(args).forEach(function(key) {
		if(args.hasOwnProperty(key)) {
			options[key] = args[key];
		}
	});
		
	this.github.authenticate(this.authenticate_settings());
	this.github.releases.createRelease(options, callback);
};

NodePreGypGithub.prototype.uploadAsset = function(cfg){
	this.github.authenticate(this.authenticate_settings());
	this.github.releases.uploadAsset({
		owner: this.owner,
		id: this.release.id,
		repo: this.repo,
		name: cfg.fileName,
		filePath: cfg.filePath
	}, function(err){
		if(err) throw err;
		console.log('Staged file ' + cfg.fileName + ' saved to ' + this.owner + '/' +  this.repo + ' release ' + this.release.tag_name + ' successfully.');
	}.bind(this));
};

NodePreGypGithub.prototype.uploadAssets = function(){
	var asset;
	console.log("Stage directory path: " + path.join(this.stage_dir));
	fs.readdir(path.join(this.stage_dir), function(err, files){
		if(err) throw err;
		
		if(typeof files === 'undefined') throw new Error('No file found to upload');
		
		files.forEach(function(file){
			asset = this.release.assets.filter(function(element, index, array){
				return element.name === file;
			});
			if(asset.length) {
				console.log("Staged file " + file + " found but it already exists in release " + this.release.tag_name + ". If you would like to replace it, you must first manually delete it within GitHub.");
			}
			else {
				console.log("Staged file " + file + " found. Proceeding to upload it.");
				this.uploadAsset({
					fileName: file,
					filePath: path.join(this.stage_dir, file)
				});
			}
		}.bind(this));
	}.bind(this));
};

NodePreGypGithub.prototype.publish = function(options) {
	this.init();
	this.github.authenticate(this.authenticate_settings());
	this.github.releases.listReleases({
		'owner': this.owner,
		'repo': this.repo
	}, function(err, data){
		var release;
		
		if(err) throw err;
		
		// when remote_path is set expect files to be in stage_dir / remote_path after substitution
		if (this.package_json.binary.remote_path) {
			options.tag_name = this.package_json.binary.remote_path.replace(/{version}/g, this.package_json.version);
			this.stage_dir = path.join(this.stage_dir, options.tag_name);
		} else {
			// This is here for backwards compatibility for before binary.remote_path support was added in version 1.2.0.
			options.tag_name = this.package_json.version;
		}
		
		release	= (function(){ // create a new array containing only those who have a matching version.
			data = data.filter(function(element, index, array){
				return element.tag_name === options.tag_name;
			}.bind(this));
			return data;
		}.bind(this))();
		
		this.release = release[0];
		
		if(!release.length) {
			this.createRelease(options, function(err, release) {
				if(err) throw err;

				this.release = release;
				if (release.draft) {
					console.log('Release ' + release.tag_name + " not found, so a draft release was created. YOU MUST MANUALLY PUBLISH THIS DRAFT WITHIN GITHUB FOR IT TO BE ACCESSIBLE.");
				} else {
					console.log('Release ' + release.tag_name + " not found, so a new release was created and published.");
				}
				this.uploadAssets();
			}.bind(this));
		}
		else {
			this.uploadAssets();
		}
	}.bind(this));
};

module.exports = NodePreGypGithub;