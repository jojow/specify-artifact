'use strict'

const path = require('path');
const async = require('async');
const fs = require('fs-extra');

const prepare = require('../lib/prepare');



async.series([
  function(done) {
    prepare('https://supermarket.chef.io/cookbooks/mysql/download', null, (err, output) => {
      if (err) return done(err);

      console.log('remote extractable file:', output);

      fs.remove(output.path, done);
    });
  },
  function(done) {
    prepare(__dirname, null, (err, output) => {
      if (err) return done(err);

      console.log('local dir:', output);

      done();
    });
  },
  function(done) {
    prepare(path.join(__dirname, 'fixture.zip'), null, (err, output) => {
      if (err) return done(err);

      console.log('local extractable file:', output);

      fs.remove(output.path, done);
    });
  },
  function(done) {
    prepare(path.join(__dirname, 'fixture.txt'), null, (err, output) => {
      if (err) return done(err);

      console.log('local non-extractable file:', output);

      done();
    });
  },
  function(done) {
    prepare('https://gist.githubusercontent.com/jojow/0e5f6cea3d052999b662b60ad37f6d2f/raw/212ddd43f4372b95bb334aa94755412bc93cc117/opal-clus.metadata.json', null, (err, output) => {
      if (err) return done(err);

      console.log('remote non-extractable file:', output);

      fs.remove(output.path, done);
    });
  },
  function(done) {
    prepare('https://github.com/jojow/specify-artifact.git', null, (err, output) => {
      if (err) return done(err);

      console.log('remote repository:', output);

      fs.remove(output.path, done);
    });
  }
], function(err) {
  if (err) throw err;
});
