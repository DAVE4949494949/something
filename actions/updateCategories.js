var async = require('async');
var mysql = require('mysql');
var parser = require(__dirname + '/../lib/parser.js');
var validator = require('validator');
var _ = require('underscore');

var Action = {

  _api: null,

  _connection: null,

  _db: null,

  _data: null,

  _stopped: true,

  init: function(api, connection) {

    Action._api = api;

    Action._connection = connection;

    Action._db = mysql.createConnection(api.config.mysql);

    Action._db.connect();

    Action._proxyList = api.proxyList || [];

    Action._taskId = validator.toInt(connection.params.id);

    Action._data = {};

    Action._stopped = false;
  },

  // Update only categories
  updateCategories: function(api, connection, next) {
    // init system variables
    try {
      Action.init(api, connection);
    } catch (e) {
      return next(e);
    }

    async.waterfall([
      Action._getProxy,
      function(cb) {
        cb(null, Action._taskId);
      },
      Action._getTasks,
      Action._uploadCategories,
      Action._parseCaterogies
    ],
      function(err) {
        async.waterfall(
          [
            function (fn) {
              Action._api.log('Remove current task', 'notice');
              Action._removeTask(Action._taskId, fn);
            }
          ],
          function (dberr) {
            if (err || dberr) {
              connection.response.error = err ? err.toString() : dberr;
            }

            if (connection.type == 'websocket') {
              connection.response = {
                redirect: '/website/' + Action._getData('url'),
                error: connection.response.error
              };
            } else {
              connection.response = {
                success: Action._getData(),
                error: connection.response.error
              };
            }

            if (connection.type == 'socket' || connection.type == 'websocket') {
              connection.sendMessage(connection.response);
            }

            return next(connection, true);
          });
      }
    );
  },

  // initialization proxy collection
  _getProxy: function(cb) {
      if (Action._proxyList.length) {
        return cb();
      }
      var i = setInterval(function () {
        if (!Action._api.proxyList || !Action._api.proxyList.length) {
          return;
        }
        Action._proxyList = _.shuffle(Action._api.proxyList);
        clearInterval(i);
        cb();
      }, 200);
  },

  // loading tasks by current ID
  _getTasks: function(taskId, cb) {
    Action._db.query('SELECT `url` FROM `analiztask` WHERE `id` = ' + taskId, function (err, rows) {
      if (err) {
        return cb(err);
      }

      if (!rows || !rows[0]) {
        return cb(new Error('task not found'));
      }

      var url = parser.getHostName('http://' + rows[0].url.replace(/https?:\/\//, ''));

      if (!validator.isURL(url)) {
        return cb(new Error('url invalid'));
      }

      Action._setData('url', url);

      cb();
    });
  },

  // Remove task from DB
  _removeTask: function(taskId, cb) {
    Action._db.query('DELETE FROM `analiztask` WHERE `id` = ' + taskId, cb);
  },

  // Upload Cateegories of item
  _uploadCategories: function(cb) {
    async.eachSeries(Action._proxyList, function (proxy, fn) {
      parser.getCategories(Action._getData('url'), proxy, function (err, cats) {
        if (err) {
          Action._api.log('getCategories error', 'error', err);
          return fn(null);
        }
        Action._setData('categories', cats || []);
        fn(true);
      });
    }, function (err) {
      var categories = Action._getData('categories');
      if (categories) {
        cb(null);
      } else {
        cb(err || new Error('getCategories error', 'EPARSEGEOIP'));
      }
    });
  },

  // Parsing categories
  _parseCaterogies: function(cb) {
    async.waterfall([
      function(cb2) {
        Action._api.log('Start parsing categories', 'notice', Action._getData('url'));
        Action._getSiteInfoByUrl(Action._getData('url'), function(err, rows) {
          if (err) {
            return cb2(err);
          }

          // If row doesn't exist
          if (!rows[0] || !rows[0].id) {
            return cb2(new Error('Site doesnt exist'));
          }

          var
            data = Action._getData(),
            site = rows[0];

          try {
            site.base_analiz = JSON.parse(site.base_analiz);
          } catch (e) {
            site.base_analiz = {};
          }
          site.base_analiz.categories = data.categories;

          // Merging new data to base object
          site = _.extend(site, data);
          console.log(site);
          // Updating site info
          Action._api.log('Start updating site info', 'notice');
          Action._updateAnalysis(site, cb2);
        });
      },
      function(siteId, cb2) {
        // Upsert cagegories
        Action._api.log('Start inserting categories', 'notice');
        Action.updateSiteCategories(siteId, Action._getData('categories'), cb2);
      }
    ], cb);
  },

  _setData: function(name, value, _default) {
    Action._data[name] = value || _default;
  },

  _getData: function(name) {
    if (!name) {
      return Action._data;
    }
    return Action._data[name];
  },

  _clearData: function() {
    delete Action._data;
    Action._data = {};
  },

  _getSiteInfoByUrl: function(url, cb) {
    Action._db.query('SELECT * FROM `analiz` WHERE `site` LIKE ' + Action._db.escape(url) + '', cb);
  },

  // Updating analyz row
  _updateAnalysis: function(data, cb) {
    Action._db.query('UPDATE `analiz` ' +
      'SET ' +
      '`base_analiz` = ' + Action._db.escape(JSON.stringify(data.base_analiz)) + ', ' +
      '`update_date` = UNIX_TIMESTAMP() + 86400 ' +
      'WHERE `id` = ' + data.id,
      function (err, res) {
        cb(err, data.id);
      }
    );
  },

  getOrInsertCategory: function(categoryName, cb) {
    Action._db.query('SELECT `id` FROM `category` WHERE `name` LIKE ' + Action._db.escape(categoryName) + '', function(err, rows) {
      if (err) return cb(err);
      if (!rows[0]) {
        Action._db.query('INSERT INTO `category` SET `name` = ' + Action._db.escape(categoryName) + '', function (err, res) {
          cb(err, res.insertId);
        });
      } else {
        cb(err, rows[0].id);
      }
    });
  },

  // Updating category's dependencies
  updateSiteCategories: function(siteId, categories, cb) {
    Action._db.query('DELETE FROM `analiz_category` WHERE `analiz_id` = ' + Action._db.escape(siteId), function (err) {
      if (err) {
        return cb(err);
      }
      // Upsert categories
      async.each(categories || [], function (categoryName, done) {
        Action.getOrInsertCategory(categoryName, function (err, categoryId) {
          if (err) {
            return done(err);
          }
          Action._db.query('INSERT INTO `analiz_category` SET `category_id` = ' + categoryId + ', `analiz_id` = ' + siteId, done);
        });
      }, function (err) {
        cb(err);
      });
    });
  }

};


exports.action = {
  name:                   'updateCategories',
  description:            'update only categories',
  blockedConnectionTypes: [],
  outputExample:          {},
  matchExtensionMimeType: false,
  version:                1.0,

  inputs: {
    required: [ 'id' ],
    optional: []
  },

  run: function(api, connection, next) {
    api.log('-- Start Task for Updating Categories --', 'notice');
    Action.updateCategories(api, connection, next);
  }
};