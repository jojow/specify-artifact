'use strict'

const path = require('path');
const async = require('async');
const fs = require('fs-extra');

const docker = require('../lib/docker');



async.series([
  function(done) {
    docker.specify('dockerhub:opentosca/winery', null, (err, result) => {
      if (err) return done(err);

      console.log('artifact spec:', JSON.stringify(result.spec, null, 2));

      docker.fetchDependencies(result, (err, result) => {
        if (err) return done(err);

        console.log('dependencies fetched and stored:', result.path);

        fs.remove(result.path, done);
      });
    });
  },
  function(done) {
    docker.specify('https://github.com/jojow/opentosca-dockerfiles::/winery', null, (err, result) => {
      if (err) return done(err);

      console.log('artifact spec:', JSON.stringify(result.spec, null, 2));

      docker.fetchDependencies(result, (err, result) => {
        if (err) return done(err);

        console.log('dependencies fetched and stored:', result.path);

        fs.remove(result.path, done);
      });
    });
  },
  function(done) {
    docker.specify('https://github.com/jojow/opentosca-dockerfiles::/winery/Dockerfile', null, (err, result) => {
      if (err) return done(err);

      console.log('artifact spec:', JSON.stringify(result.spec, null, 2));

      docker.fetchDependencies(result, (err, result) => {
        if (err) return done(err);

        console.log('dependencies fetched and stored:', result.path);

        fs.remove(result.path, done);
      });
    });
  }
], function(err) {
  if (err) throw err;
});
