# node-pre-gyp-github
##### A node-pre-gyp module which provides the ability to publish to GitHub releases.

[![Join the chat at https://gitter.im/bchr02/node-pre-gyp-github](https://badges.gitter.im/bchr02/node-pre-gyp-github.svg)](https://gitter.im/bchr02/node-pre-gyp-github?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Usage
Instead of ```node-pre-gyp publish``` use **```node-pre-gyp-github publish```**

## Options
* --release : Publish the GitHub Release immediately instead of creating a Draft.

ex. ```node-pre-gyp-github publish --release```

## Install
```javascript
npm install -g node-pre-gyp-github
```

## Configuration
This module is intended to be used with node-pre-gyp. Therefore, be sure to configure and install node-pre-gyp first. After having done that, within **```package.json```** update the ```binary``` properties ```host``` and ```remote_path``` so it matches the following format:

```
  "host": "https://github.com/[owner]/[repo]/releases/download/",
  "remote_path": "{version}"
```

Be sure to replace ```[owner]```, ```[repo]```, with actual values,
but DO NOT replace ```{version}``` with actual version.

***WARNING: Variable substitutions are not supported on the ```host``` property but are supported in ```remote_path```, but the value of ```remote_path``` after substitutions must match the release tag name.*** Otherwise it will result in users installing the wrong binary versions.

Within GitHub, create a new authorization:

1. go to Settings 
2. click Personal access tokens
3. click Generate new token
4. Select all checkboxes (in a future update I will specify which precise checkboxes are needed, but for now...)
5. Generate Token
6. copy the key that's generated and set NODE_PRE_GYP_GITHUB_TOKEN environment variable to it. Within your command prompt:

```
SET NODE_PRE_GYP_GITHUB_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

## Example (Publish to GitHub as a Draft Release)
1. node-pre-gyp configure
2. node-pre-gyp build
3. node-pre-gyp package
4. node-pre-gyp-github publish

## Example (Publish to GitHub as a Release)
1. node-pre-gyp configure
2. node-pre-gyp build
3. node-pre-gyp package
4. node-pre-gyp-github publish --release

## Advanced - release tag name

```node-pre-gyp-github``` will match the current release tag with the contents of the ```version``` property found in ```package.json```. Using --tag option you may supply your own tag name, but make sure the ```remote_path``` property matches the tag name exactly (after substitutions). Otherwise ```node-pre-gyp-github`` will not be able to upload packed binary.

Let's say the new version of your package is 1.2.3 and you want release tag to match the default ```npm version``` format (with "v" prefix):

Change ```remote_path``` to:

```
  "remote_path": "v{version}"
```

and publish with:

```
node-pre-gyp-github publish --release --tag v1.2.3
```
