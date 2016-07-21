'use strict'

const os = require('os');
const async = require('async');
const debug = require('debug')('specify-artifact:chef');
const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const got = require('got');
const flatten = require('flat');
const shortid = require('shortid');
const decompress = require('decompress');
const childProc = require('child_process');

const prepare = require('./prepare');



const specify = (input, options, done) => {
  let result;
  const spec = {};

  let metadata = {};
  const attrFiles = [];

  let dir;
  let metadataJson;
  let tempRb;

  if (_.startsWith(input, 'chefsupermarket:') || _.startsWith(input, 'chef:')) {
    const inputParts = input.split(':');

    if (_.size(inputParts) > 2) input = 'https://supermarket.chef.io/cookbooks/' + inputParts[1] + '/versions/' + inputParts[2] + '/download'
    else input = 'https://supermarket.chef.io/cookbooks/' + inputParts[1] + '/download';
  }

  async.series([
    function(done) {
      prepare(input, options, (err, output) => {
        if (err) return done(err);

        result = output;

        if (result.type === 'file') {
          metadataJson = result.path;

          result.path = path.dirname(result.path);
          result.type = 'dir';
        }

        dir = result.path;

        metadataJson = metadataJson || path.join(dir, 'metadata.json');
        tempRb = path.join(dir, 'temp.rb');

        done();
      });
    }, function(done) { //TODO replace sync IO calls by async ones
      try {
        if (!fs.statSync(metadataJson).isFile()) return done();
      } catch (err) {
        return done();
      }

      //TODO if metadata.json does not exist: generate it from metadata.rb file, if JSON variant doesn't exist using the following command: knife cookbook metadata mysql -o /cookbooks

      // get recipes and attributes from metadata
      metadata = JSON.parse(fs.readFileSync(metadataJson));
      metadata.attributes = metadata.attributes || {};
      metadata.recipes = metadata.recipes || {};

      spec.name = metadata.name + '-cookbook';
      spec.type = 'chef_cookbook';
      spec.cookbook_name = metadata.name;
      spec.description = 'Parameters are directly mapped to cookbook attributes, ' +
                         'e.g. "foo/bar" is mapped to "node[\'foo\'][\'bar\']". ';

      const readmePath = path.join(dir, 'README.md');

      try {
        if (fs.statSync(readmePath).isFile()) spec.readme = fs.readFileSync(readmePath, 'utf8');
      } catch (err) {}

      // get more recipes from Ruby files
      const recipesDir = path.join(dir, 'recipes');

      try {
        if (!fs.statSync(recipesDir).isDirectory()) return done();
      } catch (err) {
        return done();
      }

      _.each(fs.readdirSync(recipesDir), function(file) {
        if (fs.statSync(path.join(recipesDir, file)).isDirectory()) return;

        let name = metadata.name + '::' + path.basename(file, '.rb');

        if (file === 'default.rb') name = metadata.name;

        metadata.recipes[name] = metadata.recipes[name] || '';
      });

      // Get attribute files
      const attrDir = path.resolve(dir, 'attributes');

      try {
        if (fs.statSync(attrDir).isDirectory()) {
          if (fs.statSync(path.resolve(attrDir, 'default.rb')).isFile())
            attrFiles.push(path.resolve(attrDir, 'default.rb'));

          _.each(fs.readdirSync(attrDir), function(file) {
            if (fs.statSync(path.join(attrDir, file)).isDirectory() ||
                path.extname(file) !== '.rb' ||
                file === 'default.rb') return;

            attrFiles.push(path.resolve(attrDir, file));
          });
        }
      } catch (err) {}

      // get more attributes from Ruby files
      const rubyBin = process.env.RUBY_BIN || 'ruby'; //TODO use opal/node-opal packaged instead

      const mashNew = 'Mash.new { |mash, key| mash[key] = ' +
                      'Mash.new { |mash, key| mash[key] = ' +
                      'Mash.new { |mash, key| mash[key] = ' +
                      'Mash.new { |mash, key| mash[key] = ' +
                      'Mash.new { |mash, key| mash[key] = ' +
                      'Mash.new { |mash, key| mash[key] = ' +
                      'Mash.new { |mash, key| mash[key] = Mash.new } } } } } } }';

      //mashNew = 'Mash.new';

      const mashClass = path.resolve(__dirname, 'chef-mash.rb');

      const tpl = [ 'cat <%= mashClass %> >> <%= tempRb %> &&',
                    'echo "require \'json\'\n',
                    //'Mash = Hash\n',
                    'default = node = kernel = <%= mashNew %>\n',
                    'def node.platform?(arg)\nend\n',
                    'def node.platform_family?(arg)\nend\n',
                    //'node = <%= mashNew %>\n',
                    '<%= name %> = <%= mashNew %>\n',
                    '<% if (platform) { %> node[\'platform\'] = \'<%= platform %>\'\n <% } %>',
                    '<% if (platformVersion) { %> node[\'platform_version\'] = \'<%= platformVersion %>\'\n <% } %>',
                    '" >> <%= tempRb %> &&',
                    '<% _.forEach(attrFiles, function(file) { print("cat " + file + " >> " + tempRb + " && "); }); %>',
                    'echo "\nputs default.to_json" >> <%= tempRb %> &&',
                    '<%= rubyBin %> <%= tempRb %> &&',
                    'rm <%= tempRb %>' ].join(' ');

      const cmd = _.template(tpl)({ name: metadata.name,
                                    mashClass: mashClass,
                                    mashNew: mashNew,
                                    platform: process.env.DEFAULT_PLATFORM || 'ubuntu',
                                    platformVersion: process.env.DEFAULT_PLATFORM_VERSION || '14.04',
                                    tempRb: tempRb,
                                    attrFiles: attrFiles,
                                    rubyBin: rubyBin });

      debug('cmd', cmd);

      const ruby = childProc.exec(cmd, function(err, stdout, stderr) {
        debug('err', err);
        debug('stderr', stderr);
        debug('stdout', stdout);

        if (err && err.code != 0) {
          console.error('warning: cannot read additional cookbook attributes file');
        } else {
          const attributes = flatten(JSON.parse(stdout.replace(/(\r\n|\n|\r)/gm, '')), { delimiter: '/', safe: true });

          _.each(attributes, function(val, key) {
            if (metadata.attributes[key] ||
                key === 'platform' ||
                key === 'platform_version') return;

            let type = 'unknown';

            if (_.isNumber(val)) type = 'number';
            else if (_.isBoolean(val)) type = 'boolean';
            else if (_.isString(val)) type = 'string';
            else if (_.isArray(val)) type = 'json_array';

            metadata.attributes[key] = { default: val, type: type };
          });
        }

        spec.parameters_schema = {};

        if (!_.isEmpty(metadata.attributes)) {
          spec.parameters_schema = metadata.attributes;

          _.each(spec.parameters_schema, function(param, name) {
            param.mapping = 'cookbook_attribute';
          });
        }

        spec.parameters_schema.run_list = {
          type: 'json_array',
          description: 'Available recipes: ',
          //mapping: 'run_list',
          json_schema: null
        };

        spec.parameters_required = [ 'run_list' ];

        let sep = '';
        _.each(metadata.recipes, function(desc, name) {
          spec.parameters_schema.run_list.description += sep + 'recipe[' + name + ']';

          if (!_.isEmpty(desc)) {
            spec.parameters_schema.run_list.description += ' (' + desc + ')';
          }

          sep = ', ';
        });

        const recipeNames = _.keys(metadata.recipes);

        if (_.includes(recipeNames, metadata.name)) {
          spec.parameters_schema.run_list.default = [ 'recipe[' + metadata.name + ']' ]
        } else {
          spec.parameters_schema.run_list.default = [ 'recipe[' + _.first(recipeNames) + ']' ]
        }

        done();
      });
    }
  ], (err) => {
    if (!err && _.isEmpty(spec)) {
      err = new Error('cannot find any Chef-specific information, probably the given artifact is not a cookbook');
    }

    if (err) return done(err);

    result.spec = spec;

    done(null, result);
  });
};



const fetchDependencies = (args, done) => {
  args = args || {};

  if (!args.spec) return done(new Error('artifact spec missing'));
  else if (!args.path || args.type !== 'dir') return done(new Error('cookbook path missing or not a directory'));

  const doneWrapped = (err) => { done(err, args) };

  args.spec.dependencies_subdir = 'cookbook_dependencies';

  const metadata = JSON.parse(fs.readFileSync(path.resolve(args.path, 'metadata.json')));
  const depsDir = path.resolve(args.path, args.spec.dependencies_subdir);

  fs.ensureDirSync(depsDir);

  const downloadDeps = (metadata, done) => {
    if (_.isEmpty(metadata.dependencies)) return done();

    async.eachSeries(_.keys(metadata.dependencies), (dep, done) => {
      done = _.once(done);

      const depDir = path.join(depsDir, dep);
      let ver = metadata.dependencies[dep];

      try {
        if (fs.statSync(depDir).isDirectory()) return done();
      } catch (err) {}

      let url = 'https://supermarket.chef.io/cookbooks/' + dep + '/download';

      if (_.startsWith(ver, '=')) {
        ver = ver.substr(1).trim();

        url = 'https://supermarket.chef.io/cookbooks/' + dep + '/versions/' + ver + '/download';
      }

      //TODO if ver starts with '<' or '<=', look for corresponding version at https://supermarket.chef.io/api/v1/cookbooks/<NAME>

      const tempFile = path.join(os.tmpdir(), 'specify-artifact', 'chefdep-' + shortid.generate());

      const downloadFinished = _.once((err) => {
        if (err) return done(err);

        decompress(tempFile, depDir, { extract: true, strip: 1 }).then(files => {
          async.parallel([
            async.apply(fs.remove, tempFile),
            function(done) {
              const metadataFile = path.join(depDir, 'metadata.json');

              fs.stat(metadataFile, (err, stat) => {
                if (err || !stat.isFile()) {
                  return done(err);
                } else {
                  const metadata = JSON.parse(fs.readFileSync(metadataFile));

                  downloadDeps(metadata, done);
                }
              });
            }
          ], done);
        }).catch(err => {
          async.parallel([
            async.apply(fs.remove, depDir),
            async.apply(fs.remove, tempFile)
          ], done);
        });
      });

      fs.ensureDir(path.dirname(tempFile), (err) => {
        if (err) return done(err);

        got.stream(url).on('error', (err) => {
          downloadFinished(new Error('GET request failed: ' + url + '; ' + err));
        }).pipe(fs.createWriteStream(tempFile)).on('error', (err) => {
          downloadFinished(new Error('GET request failed: ' + url + '; ' + err));
        }).on('finish', downloadFinished);
      });
    }, done);
  };

  downloadDeps(metadata, doneWrapped);
};



module.exports = {
  specify: specify,
  fetchDependencies: fetchDependencies
};
