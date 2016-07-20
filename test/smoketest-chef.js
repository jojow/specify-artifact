'use strict'

const path = require('path');
const async = require('async');
const fs = require('fs-extra');

const chef = require('../lib/chef');



async.series([
  function(done) {
    chef.specify('https://supermarket.chef.io/cookbooks/apache2/versions/2.0.0/download', null, (err, result) => {
      if (err) return done(err);

      console.log('artifact spec:', JSON.stringify(result.spec, null, 2));
      console.log('cookbook path:', result.path);

      chef.resolve(result, (err) => {
        if (err) return done(err);

        console.log('cookbook dependencies resolved');

        fs.remove(result.path, done);
      });
    });
  }
], function(err) {
  if (err) throw err;
});
