"use strict";

var expect = require("chai").expect;
var fs = require("fs");
var Index = require('../index.js');
var index = new Index();
var stage_dir = index.stage_dir;
var Octokit = require("@octokit/rest");
var octokit = Octokit();
var sinon = require('sinon')
var reset_index = function(index_string_ref) {
	delete require.cache[require.resolve(index_string_ref)];
	return require(index_string_ref);
};

var sandbox = sinon.createSandbox();

var reset_mocks = function() {
	sandbox.restore();
	process.env.NODE_PRE_GYP_GITHUB_TOKEN = "secret";
	fs = reset_index('fs');
	fs.readFileSync = function(){return '{"name":"test","version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/","remote_path":"{version}"}}';};
	index.stage_dir = stage_dir;
	Index.prototype.octokit = function() {return octokit;};
	sandbox.stub(octokit, 'authenticate');
	sandbox.stub(octokit.repos, 'getReleases').callsFake(function(options, cb){
		cb(null, {data: [{"tag_name":"0.0.0","assets":[{"name":"filename"}]}]});
	});
	sandbox.stub(octokit.repos, 'createRelease').callsFake(function(options, cb){
		cb(null,{data: {"tag_name":"0.0.1","draft":true,"assets":[{}]}});
	});
	sandbox.stub(octokit.repos, 'uploadAsset').callsFake(function(cfg,cb){cb();});
};

if(!process.env.COVERALLS_SERVICE_NAME) console.log('To post to coveralls.io, be sure to set COVERALLS_SERVICE_NAME environment variable');
if(!process.env.COVERALLS_REPO_TOKEN) console.log('To post to coveralls.io, be sure to set COVERALLS_REPO_TOKEN environment variable');

describe("Publishes packages to GitHub Releases", function() {
	
	describe("Publishes without an error under all options", function() {
		
		it("should publish without error in all scenarios", function() {
			var log = console.log;
			reset_mocks();
			fs.readdir = function(filename, cb) {
				cb(null,["filename"]);
			};
	    	fs.statSync = function() {return 0;}
			console.log = function() {};

			// testing scenario when a release already exists
			expect(function(){ index.publish(); }).to.not.throw();
			expect(function(){ index.publish({'draft': false, 'verbose': false}); }).to.not.throw();
			expect(function(){ index.publish({'draft': false, 'verbose': true}); }).to.not.throw();
			expect(function(){ index.publish({'draft': true, 'verbose': false}); }).to.not.throw();
			expect(function(){ index.publish({'draft': true, 'verbose': true}); }).to.not.throw();
			
			// testing scenario when a release does not already exist
			octokit.repos.getReleases = function(options, cb){
				cb(null,{data: []});
			};
			octokit.repos.createRelease = function(options, cb){
				cb(null, { data: { draft: false} });
			};
			expect(function(){ index.publish(); }).to.not.throw();
			expect(function(){ index.publish({'draft': false, 'verbose': false}); }).to.not.throw();
			expect(function(){ index.publish({'draft': false, 'verbose': true}); }).to.not.throw();
			octokit.repos.createRelease = function(options, cb){
				cb(null, { data: { draft: true} });
			};
			expect(function(){ index.publish({'draft': true, 'verbose': false}); }).to.not.throw();
			expect(function(){ index.publish({'draft': true, 'verbose': true}); }).to.not.throw();
			fs.readFileSync = function(){return '{"version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/","remote_path":"{version}"}}';};
			expect(function(){ index.publish(); }).to.not.throw();
			console.log = log;
		});
	
	});
	
	describe("Throws an error when node-pre-gyp-github is not configured properly", function() {
		
		it("should throw an error when missing repository.url in package.json", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readFileSync = function(){return '{}';};
			expect(function(){ index.publish(options); }).to.throw("Missing repository.url in package.json");
		});
		
		it("should throw an error when a correctly formatted GitHub repository.url is not found in package.json", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readFileSync = function(){return '{"repository": {"url":"bad_format_url"}}';};
			expect(function(){ index.publish(options); }).to.throw("A correctly formatted GitHub repository.url was not found within package.json");
		});
		
		it("should throw an error when missing binary.host in package.json", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readFileSync = function(){return '{"repository": {"url":"git+https://github.com/test/test.git"}}';};
			expect(function(){ index.publish(options); }).to.throw("Missing binary.host in package.json");
		});
		
		it("should throw an error when binary.host does not begin with the correct url", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readFileSync = function(){return '{"repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"bad_format_binary"}}';};
			expect(function(){ index.publish(options); }).to.throw(/^binary.host in package.json should begin with:/i);
		});
		
		it("should throw an error when the NODE_PRE_GYP_GITHUB_TOKEN environment variable is not found", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			process.env.NODE_PRE_GYP_GITHUB_TOKEN = "";
			expect(function(){ index.publish(options); }).to.throw("NODE_PRE_GYP_GITHUB_TOKEN environment variable not found");
		});
		
		it("should throw an error when octokit.repos.getReleases returns an error", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
      
			octokit.repos.getReleases.restore();
      		sandbox.stub(octokit.repos, 'getReleases').callsFake(function(options, cb){
				cb(new Error('getReleases error'));
			});
			expect(function(){ index.publish(options); }).to.throw('getReleases error');
		});
		
		it("should throw an error when octokit.repos.createRelease returns an error", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			octokit.repos.getReleases = function(options, cb){
				cb(null,{data: []});
			};
			octokit.repos.createRelease = function(options, cb){
				cb(new Error('createRelease error'));
			};
			expect(function(){ index.publish(options); }).to.throw('createRelease error');
		});
		
		it("should throw an error when the stage directory structure is missing", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readdir = function(filename, cb) {
				cb(new Error('readdir Error'));
			};
			expect(function(){ index.publish(options); }).to.throw('readdir Error');
		});
		
		it("should throw an error when there are no files found within the stage directory", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readdir = function(filename, cb) {
				cb(null,[]);
			};
			expect(function(){ index.publish(options); }).to.throw(/^No files found within the stage directory:/i);
		});
		
		it("should throw an error when a staged file already exists in the current release", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readdir = function(filename, cb) {
				cb(null,["filename"]);
			};
			octokit.repos.getReleases = function(options, cb){
				cb(null, {data: [{"tag_name":"0.0.1","assets":[{"name":"filename"}]}]});
			};
			expect(function(){ index.publish(options); }).to.throw(/^Staged file .* found but it already exists in release .*. If you would like to replace it, you must first manually delete it within GitHub./i);
		});
		
		it("should throw an error when github.releases.uploadAsset returns an error", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readdir = function(filename, cb) {
				cb(null,["filename"]);
			};
			octokit.repos.uploadAsset = function(cfg,cb){
				cb(new Error('uploadAsset error')); 
			};
			expect(function(){ index.publish(options); }).to.throw("uploadAsset error");
		});
		
	});
	
	describe("Verify backwords compatible with any breaking changes made within the same MINOR version.", function() {
	
		it("should publish even when package.json's binary.remote_path property is not provided and instead the version is hard coded within binary.host", function() {
			var options = {'draft': false, 'verbose': false};
			reset_mocks();
			fs.readFileSync = function(){return '{"name":"test","version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/0.0.1"}}';};
			fs.readdir = function(filename, cb) {
				cb(null,["filename"]);
			};
      		fs.statSync = function() {return 0;}
			octokit.reposcreateRelease = function(options, cb){
				cb(null,{data: {"tag_name":"0.0.1","draft":false,"assets":[{}]}});
			};
			expect(function(){ index.publish(options); }).to.not.throw();
		});
		
	});
});
