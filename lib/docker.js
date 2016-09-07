'use strict'

const async = require('async');
const debug = require('debug')('specify-artifact:docker');
const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const got = require('got');
const dockerfileParse = require('dockerfile-parse');

const prepare = require('./prepare');



const specify = (input, options, done) => {
  let result = {};
  const spec = {};

  async.series([
    function(done) {
      if (!_.startsWith(input, 'dockerhub:') && !_.startsWith(input, 'docker:')) return done();

      const inputParts = input.split(':');
      let repo = inputParts[1];
      if (!_.includes(repo, '/')) repo = 'library/' + repo;
      if (_.size(inputParts) > 2) spec.docker_tag = inputParts[2];

      spec.dockerhub = {};
      spec.dockerhub.web_url = 'https://hub.docker.com/r/' + repo.replace('library', '_');
      spec.dockerhub.repository_url = 'https://hub.docker.com/v2/repositories/' + repo;
      spec.dockerhub.tags_url = spec.dockerhub.repository_url + '/tags';

      if (_.startsWith(repo, 'library/')) {
        spec.docker_image = repo.split('/')[1];
      } else {
        spec.dockerhub.dockerfile_url = spec.dockerhub.repository_url + '/dockerfile';
        spec.dockerhub.autobuild_url = spec.dockerhub.repository_url + '/autobuild';
      }

      done();
    },
    function(done) {
      if (!spec.dockerhub) return done();

      // https://hub.docker.com/v2/repositories/opentosca/winery
      got(spec.dockerhub.repository_url, { json: true })
        .then(res => {
          _.forEach([
            'user',
            'name',
            'namespace',
            'status',
            'is_private',
            'is_automated',
            'star_count',
            'pull_count',
            'last_updated',
            'permissions'
          ], (prop) => {
            spec.dockerhub[prop] = res.body[prop];
          });

          spec.name = res.body.name;
          spec.description = res.body.description;
          spec.readme = res.body.full_description;

          done();
        })
        .catch(err => {
          console.error('GET', spec.dockerhub.repository_url, 'response:', err.response.body);

          done();
        });
    },
    function(done) {
      if (!spec.dockerhub) return done();

      // https://hub.docker.com/v2/repositories/opentosca/winery/tags
      got(spec.dockerhub.tags_url, { json: true })
        .then(res => {
          spec.dockerhub.tags = res.body.results;

          done();
        })
        .catch(err => {
          console.error('GET', spec.dockerhub.tags_url, 'response:', err.response.body);

          done();
        });
    },
    function(done) {
      if (!spec.dockerhub || !spec.dockerhub.is_automated) return done();

      // https://hub.docker.com/v2/repositories/opentosca/winery/dockerfile
      got(spec.dockerhub.dockerfile_url, { json: true })
        .then(res => {
          spec.dockerfile = res.body.contents;
          spec.dockerfile_json = dockerfileParse(res.body.contents);

          done();
        })
        .catch(err => {
          console.error('GET', spec.dockerhub.dockerfile_url, 'response:', err.response.body);

          done();
        });
    },
    function(done) {
      if (!spec.dockerhub || !spec.dockerhub.is_automated) return done();

      // https://hub.docker.com/v2/repositories/opentosca/winery/autobuild
      got(spec.dockerhub.autobuild_url, { json: true })
        .then(res => {
          spec.source_repository_url = res.body.source_url;
          spec.source_repository_type = res.body.repo_type;
          spec.source_repository_provider = res.body.provider;
          spec.source_repository_web_url = res.body.repo_web_url;
          spec.docker_repository = res.body.docker_url;
          spec.docker_image = res.body.docker_url;
          spec.dockerhub.build_name = res.body.build_name;

          done();
        })
        .catch(err => {
          console.error('GET', spec.dockerhub.autobuild_url, 'response:', err.response.body);

          done();
        });
    },
    function(done) {
      if (spec.dockerhub) return done();

      prepare(input, options, (err, output) => {
        if (err) return done(err);

        result = output;

        let dockerfilePath = result.path;
        if (result.type === 'dir') dockerfilePath = path.resolve(result.path, 'Dockerfile');

        fs.readFile(dockerfilePath, 'utf8', (err, content) => {
          if (err) return done(err);

          spec.dockerfile = content;
          spec.dockerfile_json = dockerfileParse(content);

          done();
        });
      });
    },
    function (done) {
      if (!spec.dockerfile_json) return done();

      spec.parameters_schema = {};

      _.forEach(spec.dockerfile_json.env, (def, key) => {
        spec.parameters_schema[key] = {
          default: def || '',
          type: 'string',
          mapping: 'environment_variable'
        };
      });

      spec.parameters_schema.exposed_ports = {
        default: spec.dockerfile_json.expose,
        type: 'json_array'
      };

      done();
    }
  ], (err) => {
    if (!err && _.isEmpty(spec.dockerfile) && _.isEmpty(spec.docker_image)) {
      err = new Error('cannot find any Docker-specific information (Dockerfile, Docker image), probably the given artifact is not Docker-related');
    }

    spec.type = 'docker';

    if (err) return done(err);

    result.spec = spec;

    done(null, result);
  });
};



const fetchDependencies = (args, done) => {
  args = args || {};

  const source_repository_url = args.source_repository_url || args.spec.source_repository_url;

  if (!source_repository_url) return done(null, args);

  delete args.type;

  prepare(source_repository_url, args, (err, output) => {
    if (err) return done(err);

    args = _.assign(args, output);

    done(null, args);
  });
};



module.exports = {
  specify: specify,
  fetchDependencies: fetchDependencies
};
