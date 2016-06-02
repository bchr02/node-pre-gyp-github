"use strict";

var expect = require("chai").expect;
var fs = require("fs");
var Index = require('../index.js');
var index = new Index();
var stage_dir = index.stage_dir;
var reset_index = function(index_string_ref) {
	delete require.cache[require.resolve(index_string_ref)];
	return require(index_string_ref);
};
var reset_mocks = function() {
	process.env.NODE_PRE_GYP_GITHUB_TOKEN = "secret";
	fs = reset_index('fs');
	fs.readFileSync = function(){return '{"name":"test","version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/","remote_path":"{version}"}}';};
	index.stage_dir = stage_dir;
	index.github.authenticate = function(){};
	index.github.releases.listReleases = function(options, cb){
		cb(null, [{"tag_name":"0.0.0","assets":[{"name":"filename"}]}]);
	};
	index.github.releases.createRelease = function(options, cb){
		cb(null,{"tag_name":"0.0.1","draft":true,"assets":[{}]});
	};
	index.github.releases.uploadAsset = function(cfg,cb){cb();};
};

if(!process.env.COVERALLS_SERVICE_NAME) console.log('To post to coveralls.io, be sure to set COVERALLS_SERVICE_NAME environment variable');
if(!process.env.COVERALLS_REPO_TOKEN) console.log('To post to coveralls.io, be sure to set COVERALLS_REPO_TOKEN environment variable');

describe("Publishes packages to GitHub Releases", function() {
	
	describe("Publishes without an error under all options", function() {
		
		it("should publish a non-draft release without an error", function() {
			var options = {'draft': false, 'verbose': false};
			reset_mocks();
			fs.readdir = function(filename, cb) {
				cb(null,["filename"]);
			};
			index.github.releases.createRelease = function(options, cb){
				cb(null,{"tag_name":"0.0.1","draft":false,"assets":[{}]});
			};
			expect(function(){ index.publish(options); }).to.not.throw();
		});
		
		it("should publish a draft release without an error", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readdir = function(filename, cb) {
				cb(null,["filename"]);
			};
			expect(function(){ index.publish(options); }).to.not.throw();
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
		
		it("should throw an error when github.releases.listReleases returns an error", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			index.github.releases.listReleases = function(options, cb){
				cb(new Error('listReleases error'));
			};
			expect(function(){ index.publish(options); }).to.throw('listReleases error');
		});
		
		it("should throw an error when github.releases.createRelease returns an error", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			index.github.releases.listReleases = function(options, cb){
				cb(null,null);
			};
			index.github.releases.createRelease = function(options, cb){
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
			index.github.releases.listReleases = function(options, cb){
				cb(null, [{"tag_name":"0.0.1","assets":[{"name":"filename"}]}]);
			};
			expect(function(){ index.publish(options); }).to.throw(/^Staged file .* found but it already exists in release .*. If you would like to replace it, you must first manually delete it within GitHub./i);
		});
		
		it("should throw an error when github.releases.uploadAsset returns an error", function() {
			var options = {'draft': true, 'verbose': false};
			reset_mocks();
			fs.readdir = function(filename, cb) {
				cb(null,["filename"]);
			};
			index.github.releases.uploadAsset = function(cfg,cb){
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
			index.github.releases.createRelease = function(options, cb){
				cb(null,{"tag_name":"0.0.1","draft":false,"assets":[{}]});
			};
			expect(function(){ index.publish(options); }).to.not.throw();
		});
		
	});
});