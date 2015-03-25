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
      function(cb) {
        console.log(Action._getData('categories'));
        next();
      }
    ]);
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

  // Upload Cateegories of item
  _uploadCategories: function(cb) {
    async.eachSeries(Action._proxyList, function (proxy, fn) {
      parser.getCategories(Action._getData('url'), proxy, function (err, cats) {
        if (err) {
          api.log('getCategories error', 'error', err);
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

  // Получение категорий
  _parseCaterogies: function(cb) {

    debug && api.log('cats:', 'notice', data.categories);

  },

  _setData: function(name, value, _default) {
    Action._data[name] = value || _default;
  },

  _getData: function(name) {
    return Action._data[name];
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
    api.log('Start updating categories', 'notice');
    Action.updateCategories(api, connection, function(err, data) {
      if (err) {
        api.log('Error parsing categories', 'crit');
        throw err;
      }
      next(connection, true);
    });
  }
};