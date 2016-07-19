'use strict'

const path = require('path');
const async = require('async');
const fs = require('fs-extra');

const prepare = require('../lib/prepare');

let testDir;

async.series([
  function(done) {
    prepare('https://supermarket.chef.io/cookbooks/mysql/download', null, (err, workingDir, workingDirCreated) => {
      if (err) return done(err);

      console.log('remote file:', workingDir, workingDirCreated);

      testDir = workingDir;

      done();
    });
  },
  function(done) {
    prepare(testDir, null, (err, workingDir, workingDirCreated) => {
      if (err) return done(err);

      console.log('local dir:', workingDir, workingDirCreated);

      done();
    });
  },
  function(done) {
    fs.remove(testDir, done);
  },
  function(done) {
    prepare(path.join(__dirname, 'fixture.zip'), null, (err, workingDir, workingDirCreated) => {
      if (err) return done(err);

      console.log('local file:', workingDir, workingDirCreated);

      testDir = workingDir;

      done();
    });
  },
  function(done) {
    fs.remove(testDir, done);
  }
], function(err) {
  if (err) throw err;
});


