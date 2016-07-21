'use strict'

const os = require('os');
const path = require('path');
const url = require('url');
const _ = require('lodash');
const async = require('async');
const shortid = require('shortid');
const fs = require('fs-extra');
const decompress = require('decompress');
const got = require('got');
const childProc = require('child_process');



const validInputTypes = [
  'http',
  'git',
  'file',
  'dir'
];

const checkoutGit = (args, done) => {
  args = args || {};

  if (!args.url) {
    return done(new Error('url missing'));
  } else if (!args.dir) {
    return done(new Error('dir missing'));
  }

  const git = childProc.exec('git clone --recursive ' + args.url + ' ' + args.dir, (err, stdout, stderr) => {
    if (err) {
      err.stdout = stdout;
      err.stderr = stderr;
    }

    done(err);
  });
};



module.exports = (input, options, done) => {
  if (!_.isString(input)) return done(new Error('input is not a string'));
  else if (!_.isFunction(done)) return done(new Error('callback is not a function'));

  options = options || {};
  options.strip = options.strip || 1;
  options.extract = true;

  const inputParts = input.split('::');

  if (_.size(inputParts) > 1) {
    options.subpath = options.subpath || _.last(inputParts);
    input = _.first(inputParts);
  }

  options.subpath = options.subpath || options.subdir;

  done = _.once(done);

  let inputType = options.type;

  if (inputType === 'https') inputType = 'http';
  else if (inputType && !_.includes(validInputTypes, inputType)) return done(new Error('invalid input type: ' + inputType));

  let output;
  let outputType;
  let outputCreated = false;

  const downloadDir = path.join(os.tmpdir(), 'specify-artifact', 'download-' + shortid.generate());

  async.series([
    function(done) {
      if (inputType) return done();

      if (_.startsWith(input, 'git@github.com:') ||
          _.startsWith(input, 'http://github.com') || _.startsWith(input, 'https://github.com') ||
          _.startsWith(input, 'git+http://') || _.startsWith(input, 'git+https://')) {
        inputType = 'git';

        done();
      } else if (_.startsWith(input, 'http://') || _.startsWith(input, 'https://')) {
        inputType = 'http';

        done();
      } else {
        fs.stat(input, (err, stats) => {
          if (err) return done(err);

          if (stats.isFile()) inputType = 'file';
          else if (stats.isDirectory()) inputType = 'dir';

          if (!inputType) return done(new Error('cannot determine input type'));

          done();
        });
      }
    },
    function(done) {
      outputType = 'dir';

      if (inputType === 'dir') {
        output = input;

        done();
      } else {
        output = path.join(os.tmpdir(), 'specify-artifact', shortid.generate());
        outputCreated = true;

        fs.ensureDir(output, done);
      }
    },
    function(done) {
      if (inputType === 'git') {
        const args = options;

        args.url = input;
        args.dir = output;

        checkoutGit(args, done);
      } else if (inputType === 'file') {
        decompress(input, output, options).then(files => {
          const tempOutput = output;
          const tempOutputCreated = outputCreated;

          if (_.isEmpty(files)) {
            output = input;
            outputType = 'file';
            outputCreated = false;

            if (tempOutputCreated) fs.remove(tempOutput, done);
          } else {
            done();
          }
        }).catch(done);
      } else if (inputType === 'http') {
        const downloadFilename = path.posix.basename(url.parse(input).pathname);

        const downloadFinished = _.once((err) => {
          if (err) return done(err);

          decompress(path.join(downloadDir, downloadFilename), output, options).then(files => {
            const tempOutput = output;
            const tempOutputCreated = outputCreated;

            if (_.isEmpty(files)) {
              output = path.join(downloadDir, downloadFilename);
              outputType = 'file';
              outputCreated = true;

              if (tempOutputCreated) fs.remove(tempOutput, done);
            } else {
              fs.remove(downloadDir, done);
            }
          }).catch(done);
        });

        fs.ensureDir(downloadDir, (err) => {
          if (err) return done(err);

          got.stream(input).on('error', (err) => {
            downloadFinished(new Error('GET request failed: ' + input + '; ' + err));
          }).pipe(fs.createWriteStream(path.join(downloadDir, downloadFilename))).on('error', (err) => {
            downloadFinished(new Error('GET request failed: ' + input + '; ' + err));
          }).on('finish', downloadFinished);
        });
      } else {
        done();
      }
    },
    function(done) {
      if (!options.subpath) return done();

      const currentOutput = output;

      output = path.join(os.tmpdir(), 'specify-artifact', shortid.generate(), shortid.generate());

      fs.ensureDir(path.dirname(output), (err) => {
        if (err) return done(err);

        fs.move(path.join(currentOutput, options.subpath), output, { clobber: true }, (err) => {
          if (err) return done(err);

          fs.remove(currentOutput, done);
        });
      });
    },
    function(done) {
      fs.stat(output, (err, stats) => {
        if (err) return done(err);

        if (stats.isFile()) outputType = 'file';
        else if (stats.isDirectory()) outputType = 'dir';

        done();
      });
    }
  ], function(err) {
    //TODO add files array to returned object
    done(err, {
      path: output,
      type: outputType,
      created: outputCreated
    });
  });
};
