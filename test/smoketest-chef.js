'use strict'

const path = require('path');
const async = require('async');

const chef = require('../lib/chef');



async.series([
  function(done) {
    chef.specify('chefsupermarket:mysql:2.0.0', null, (err, result) => {
      if (err) return done(err);

      console.log('artifact spec:', JSON.stringify(result.spec, null, 2));
      console.log('cookbook path:', result.path);

      chef.fetchDependencies(result, (err, result) => {
        if (err) return done(err);

        console.log('dependencies fetched');

        result.cleanup(done);
      });
    });
  },
  function(done) {
    chef.specify('https://supermarket.chef.io/cookbooks/apache2/versions/2.0.0/download', null, (err, result) => {
      if (err) return done(err);

      console.log('artifact spec:', JSON.stringify(result.spec, null, 2));
      console.log('cookbook path:', result.path);

      chef.fetchDependencies(result, (err, result) => {
        if (err) return done(err);

        console.log('dependencies fetched');

        result.cleanup(done);
      });
    });
  }
], function(err) {
  if (err) throw err;
});
