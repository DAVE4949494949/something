var should = require('should');
var config = require('../config/mysql');
var mysql      = require('mysql');
var conf = config[process.env.NODE_ENV || 'test'].mysql;

describe('test Mysql Connection', function() {

  it('Config must have attributes', function() {
    should.exist(conf.database);
    should.exist(conf.password);
    should.exist(conf.user);
    should.exist(conf.host);
  });
  
  it('Should set up the connection', function(done) {
    var connection = mysql.createConnection(conf);

    connection.connect(function(err) {
      if (err) {
        throw err;
      }
      done();
    });

  });
});

