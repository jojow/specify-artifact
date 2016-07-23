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

  let outputPath;
  let outputType;
  let cleanupPaths = options.cleanupPaths || [];
  let cleanupExcludes = options.cleanupExcludes || [];

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
        outputPath = input;

        done();
      } else {
        outputPath = path.join(os.tmpdir(), 'specify-artifact', shortid.generate());

        fs.ensureDir(outputPath, (err) => {
          if (err) return done(err);

          cleanupPaths.push(outputPath);

          done();
        });
      }
    },
    function(done) {
      if (inputType === 'git') {
        const args = options;

        args.url = input;
        args.dir = outputPath;

        checkoutGit(args, done);
      } else if (inputType === 'file') {
        decompress(input, outputPath, options).then(files => {
          if (_.isEmpty(files)) {
            outputPath = input;
            outputType = 'file';
          }

          done();
        }).catch(done);
      } else if (inputType === 'http') {
        const downloadFilename = path.posix.basename(url.parse(input).pathname);

        const downloadFinished = _.once((err) => {
          if (err) return done(err);

          decompress(path.join(downloadDir, downloadFilename), outputPath, options).then(files => {
            if (_.isEmpty(files)) {
              outputPath = path.join(downloadDir, downloadFilename);
              outputType = 'file';

              cleanupPaths.push(downloadDir);

              done();
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

      const currentOutputPath = outputPath;
      const outputBase = path.join(os.tmpdir(), 'specify-artifact', shortid.generate());

      outputPath = path.join(outputBase, path.basename(options.subpath));

      fs.ensureDir(path.dirname(outputPath), (err) => {
        if (err) return done(err);

        cleanupPaths.push(outputBase);

        fs.move(path.join(currentOutputPath, options.subpath), outputPath, { clobber: true }, done);
      });
    },
    function(done) {
      fs.stat(outputPath, (err, stats) => {
        if (err) return done(err);

        if (stats.isFile()) outputType = 'file';
        else if (stats.isDirectory()) outputType = 'dir';

        done();
      });
    }
  ], function(err) {
    //TODO add files array to returned object?

    cleanupPaths = _.uniq(cleanupPaths);
    cleanupExcludes = _.uniq(cleanupExcludes);

    done(err, {
      path: outputPath,
      type: outputType,
      cleanupPaths: cleanupPaths,
      cleanupExcludes: cleanupExcludes,
      cleanup: (done) => {
        async.eachSeries(cleanupPaths, function(p, done) {
          if (_.includes(cleanupExcludes, p)) return done();
          else fs.remove(p, done);
        }, done);
      }
    });
  });
};
