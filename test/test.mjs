import { use, expect } from "chai";
import chaiAsPromised from "chai-as-promised";
use(chaiAsPromised);

import fs from "fs";

import { Octokit } from "@octokit/rest";
const octokit = new Octokit();

import NodePreGypGithub from "../index.js";
const nodePreGypGithub = new NodePreGypGithub();

import sinon from "sinon";
const sandbox = sinon.createSandbox();

if (!process.env.COVERALLS_SERVICE_NAME) console.log("To post to coveralls.io, be sure to set COVERALLS_SERVICE_NAME environment variable");
if (!process.env.COVERALLS_REPO_TOKEN) console.log("To post to coveralls.io, be sure to set COVERALLS_REPO_TOKEN environment variable");

const defaultOptions = { draft: true, verbose: false };

describe("Publishes packages to GitHub Releases", function () {
  let listReleasesStub;
  let createReleaseStub;
  let uploadReleaseAssetStub;

  beforeEach(function () {
    sandbox.restore();
    process.env.NODE_PRE_GYP_GITHUB_TOKEN = "secret";
    fs.readFileSync = function () {
      return '{"name":"test","version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/","remote_path":"{version}"}}';
    };
    fs.createReadStream = () => "aaa";

    sandbox.stub(nodePreGypGithub, "createOctokitInstance").returns(octokit);
    listReleasesStub = sandbox.stub(octokit.rest.repos, "listReleases").returns({ data: [{ tag_name: "0.0.0", assets: [{ name: "filename" }] }] });
    createReleaseStub = sandbox.stub(octokit.rest.repos, "createRelease").returns({ data: { tag_name: "0.0.1", draft: true, assets: [{}] } });
    uploadReleaseAssetStub = sandbox.stub(octokit.rest.repos, "uploadReleaseAsset");
  });

  describe("Publishes without an error under all options", function () {
    it("should publish without error in all scenarios", async function () {
      const log = console.log;
      sandbox.stub(fs, "readdirSync").returns(["filename"]);
      console.log = function () {};

      // testing scenario when a release already exists
      await nodePreGypGithub.publish();
      await nodePreGypGithub.publish({ draft: false, verbose: false });
      await nodePreGypGithub.publish({ draft: false, verbose: true });
      await nodePreGypGithub.publish({ draft: true, verbose: false });
      await nodePreGypGithub.publish({ draft: true, verbose: true });

      // testing scenario when a release does not already exist
      listReleasesStub.restore();
      sandbox.stub(octokit.rest.repos, "listReleases").returns({ data: [] });
      createReleaseStub.restore();
      sandbox.stub(octokit.rest.repos, "createRelease").returns({ data: { draft: false } });

      await nodePreGypGithub.publish();
      await nodePreGypGithub.publish({ draft: false, verbose: false });
      await nodePreGypGithub.publish({ draft: false, verbose: true });

      createReleaseStub.restore();
      sandbox.stub(octokit.rest.repos, "createRelease").returns({ data: { draft: true } });

      await nodePreGypGithub.publish({ draft: true, verbose: false });
      await nodePreGypGithub.publish({ draft: true, verbose: true });
      fs.readFile = function () {
        return '{"version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/","remote_path":"{version}"}}';
      };
      await nodePreGypGithub.publish();
      console.log = log;
    });
  });

  describe("Throws an error when node-pre-gyp-github is not configured properly", function () {
    it("should throw an error when missing repository.url in package.json", async function () {
      sandbox.stub(fs, "readFileSync").returns("{}");
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith("Missing repository.url in package.json");
    });

    it("should throw an error when a correctly formatted GitHub repository.url is not found in package.json", async function () {
      sandbox.stub(fs, "readFileSync").returns('{"repository": {"url":"bad_format_url"}}');
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith("A correctly formatted GitHub repository.url was not found within package.json");
    });

    it("should throw an error when missing binary.host in package.json", async function () {
      sandbox.stub(fs, "readFileSync").returns('{"repository": {"url":"git+https://github.com/test/test.git"}}');
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith("Missing binary.host in package.json");
    });

    it("should throw an error when binary.host does not begin with the correct url", async function () {
      sandbox.stub(fs, "readFileSync").returns('{"repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"bad_format_binary"}}');
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith(/^binary.host in package.json should begin with:/i);
    });

    it("should throw an error when the NODE_PRE_GYP_GITHUB_TOKEN environment variable is not found", async function () {
      process.env.NODE_PRE_GYP_GITHUB_TOKEN = "";
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith("NODE_PRE_GYP_GITHUB_TOKEN environment variable not found");
    });

    it("should throw an error when octokit.rest.repos.listReleases returns an error", async function () {
      listReleasesStub.restore();
      sandbox.stub(octokit.rest.repos, "listReleases").throws(new Error("listReleases error"));
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith("listReleases error");
    });

    it("should throw an error when octokit.rest.repos.createRelease returns an error", async function () {
      listReleasesStub.restore();
      createReleaseStub.restore();

      sandbox.stub(octokit.rest.repos, "listReleases").returns({ data: [] });
      sandbox.stub(octokit.rest.repos, "createRelease").throws(new Error("createRelease error"));
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith("createRelease error");
    });

    it("should throw an error when the stage directory structure is missing", async function () {
      sandbox.stub(fs, "readdirSync").throws(new Error("readdir Error"));
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith("readdir Error");
    });

    it("should throw an error when there are no files found within the stage directory", async function () {
      sandbox.stub(fs, "readdirSync").returns([]);
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith(/^No files found within the stage directory:/i);
    });

    it("should throw an error when a staged file already exists in the current release", async function () {
      sandbox.stub(fs, "readdirSync").returns(["filename"]);
      listReleasesStub.restore();
      sandbox.stub(octokit.rest.repos, "listReleases").returns({ data: [{ tag_name: "0.0.1", assets: [{ name: "filename" }] }] });
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith(/^Staged file .* found but it already exists in release .*. If you would like to replace it, you must first manually delete it within GitHub./i);
    });

    it("should throw an error when github.releases.uploadAsset returns an error", async function () {
      sandbox.stub(fs, "readdirSync").returns(["filename"]);
      uploadReleaseAssetStub.restore();
      sandbox.stub(octokit.rest.repos, "uploadReleaseAsset").throws(new Error("uploadAsset error"));
      await expect(nodePreGypGithub.publish(defaultOptions)).to.be.rejectedWith("uploadAsset error");
    });
  });

  describe("Verify backwords compatible with any breaking changes made within the same MINOR version.", function () {
    it("should publish even when package.json's binary.remote_path property is not provided and instead the version is hard coded within binary.host", async function () {
      const options = { draft: false, verbose: false };
      sandbox.stub(fs, "readFileSync").returns('{"name":"test","version":"0.0.1","repository": {"url":"git+https://github.com/test/test.git"},"binary":{"host":"https://github.com/test/test/releases/download/0.0.1"}}');
      sandbox.stub(fs, "readdirSync").returns(["filename"]);

      createReleaseStub.restore();
      sandbox.stub(octokit.rest.repos, "createRelease").returns({ data: { tag_name: "0.0.1", draft: false, assets: [{}] } });
      await nodePreGypGithub.publish(options);
    });
  });
});
