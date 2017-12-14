#!/usr/bin/env node

var module = require('../index.js');
var program = require('commander');

program
	.command('publish [options]')
	.description('publishes the contents of .\\build\\stage\\{version} to the current version\'s GitHub release')
	.option("-r, --release", "publish immediately, do not create draft")
	.option("-s, --silent", "turns verbose messages off")
	.option("-p, --proxy", "set the proxy if have any")
	.action(function(cmd, options){
		var opts = {},
			x = new module();
		opts.proxy = options.proxy ? true : false;
		opts.draft = options.release ? false : true;
		opts.verbose = options.silent ? false : true;
		x.publish(opts);
	});

program
	.command('help','',{isDefault: true, noHelp: true})
	.action(function() {
		console.log();
		console.log('Usage: node-pre-gyp-github publish');
		console.log();
		console.log('publishes the contents of .\\build\\stage\\{version} to the current version\'s GitHub release');
	});

program.parse(process.argv);

if (!program.args.length) {
	program.help();
}
