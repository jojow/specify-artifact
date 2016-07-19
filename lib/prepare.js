'use strict'

const os = require('os');
const path = require('path');
const _ = require('lodash');
const async = require('async');
const shortid = require('shortid');
const fs = require('fs-extra');
const decompress = require('decompress');
const download = require('download');



module.exports = (source, options, done) => {
  if (!_.isString(source)) return done(new Error('source is not a string'));
  else if (!_.isFunction(done)) return done(new Error('callback is not a function'));

  options = options || {};
  options.strip = options.strip || 1;
  options.extract = true;

  done = _.once(done);

  let sourceType;

  let workingDir;
  let workingDirCreated = false;

  async.series([
    function(done) {
      if (_.startsWith(source, 'http://') || _.startsWith(source, 'https://')) {
        sourceType = 'url';

        done();
      } else {
        fs.stat(source, (err, stats) => {
          if (err) return done(err);

          if (stats.isFile()) sourceType = 'file';
          else if (stats.isDirectory()) sourceType = 'dir';

          if (!sourceType) return done(new Error('invalid source'));

          done();
        });
      }
    },
    function(done) {
      if (sourceType === 'dir') {
        workingDir = source;

        done();
      } else {
        workingDir = path.join(os.tmpdir(), 'specify-artifact', 'temp-' + shortid.generate());

        workingDirCreated = true;

        fs.ensureDir(workingDir, done);
      }
    },
    function(done) {
      if (sourceType === 'file') {
        decompress(source, workingDir, options).then(files => {
          done();
        }).catch(done);
      } else if (sourceType === 'url') {
        download(source, workingDir, options).then(files => {
          done();
        }).catch(done);
      } else {
        done();
      }
    }
  ], function(err) {
    done(err, workingDir, workingDirCreated);
  });
};
