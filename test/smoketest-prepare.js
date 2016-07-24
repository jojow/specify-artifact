'use strict'

const fs = require('fs');
const assert = require('assert');
const path = require('path');
const async = require('async');
const _ = require('lodash');

const prepare = require('../lib/prepare');



async.series([
  function(done) {
    prepare('https://supermarket.chef.io/cookbooks/mysql/download', null, (err, output) => {
      if (err) return done(err);

      console.log('remote extractable file:', output);

      assert.ok(output.type === 'dir');
      assert.ok(fs.statSync(output.path).isDirectory());
      assert.ok(_.includes(output.cleanupPaths, output.path));

      output.cleanup(done);
    });
  },
  function(done) {
    prepare(__dirname, null, (err, output) => {
      if (err) return done(err);

      console.log('local dir:', output);

      assert.ok(output.type === 'dir');
      assert.ok(fs.statSync(output.path).isDirectory());
      assert.ok(_.isEmpty(output.cleanupPaths));

      output.cleanup(done);
    });
  },
  function(done) {
    prepare(path.join(__dirname, 'fixture.zip'), null, (err, output) => {
      if (err) return done(err);

      console.log('local extractable file:', output);

      assert.ok(output.type === 'dir');
      assert.ok(fs.statSync(output.path).isDirectory());
      assert.ok(_.includes(output.cleanupPaths, output.path));

      output.cleanup(done);
    });
  },
  function(done) {
    prepare(path.join(__dirname, 'fixture.txt'), null, (err, output) => {
      if (err) return done(err);

      console.log('local non-extractable file:', output);

      assert.ok(output.type === 'file');
      assert.ok(fs.statSync(output.path).isFile());
      assert.ok(_.size(output.cleanupPaths) === 1);

      output.cleanup(done);
    });
  },
  function(done) {
    prepare('https://gist.githubusercontent.com/jojow/0e5f6cea3d052999b662b60ad37f6d2f/raw/212ddd43f4372b95bb334aa94755412bc93cc117/opal-clus.metadata.json', null, (err, output) => {
      if (err) return done(err);

      console.log('remote non-extractable file:', output);

      assert.ok(output.type === 'file');
      assert.ok(fs.statSync(output.path).isFile());
      assert.ok(_.size(output.cleanupPaths) === 2);

      output.cleanup(done);
    });
  },
  function(done) {
    prepare('https://github.com/jojow/specify-artifact.git', null, (err, output) => {
      if (err) return done(err);

      console.log('remote repository:', output);

      assert.ok(output.type === 'dir');
      assert.ok(fs.statSync(output.path).isDirectory());
      assert.ok(_.includes(output.cleanupPaths, output.path));

      output.cleanup(done);
    });
  }
], function(err) {
  if (err) throw err;
});
