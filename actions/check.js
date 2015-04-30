var action          = {},
    timeout         = 60000,
    debug           = true,
    tryCount        = 30,
    request         = require('request').defaults({
      timeout: timeout,
      followAllRedirects: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux i686 (x86_64)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.107 Safari/537.36'
      }
    }),
    socks = require('socks5-http-client/lib/Agent'),
    async           = require('async'),
    charset         = require('charset'),
    jschardet       = require('jschardet'),
    Buffer          = require('buffer').Buffer,
    Iconv           = require('iconv').Iconv,
    fs              = require('fs'),
    tldtools        = require('tldtools'),
    path            = require('path'),
    DNS             = require('native-dns'),
    dateformat      = require('dateformat'),
    cheerio         = require('cheerio'),
    http            = require('http'),
    validator       = require('validator'),
    mysql           = require('mysql'),
    _               = require('underscore'),
    md5             = require('crypto').createHash('md5'),
    pagerank        = require('pagerank'),
    parser          = require(__dirname + '/../lib/parser.js'),
    dataShotDir     = path.normalize(__dirname + '/../../botalizer.com/datashots/img'),
    //    faviconImageDir = path.normalize(__dirname + '/../../botalizer.com/datafavicon/img'),
    adultList       = require('fs')
      .readFileSync(__dirname + '/../adult.txt').toString()
      .split("\n")
      .map(function (el) {
        return el.replace(/\r/, '');
      }).filter(function (el) {
        return el.length > 0;
      }).map(function (el) {
        return new RegExp(el);
      }),
    adultCategories = ['Pornography', 'Sex Education', 'Nudity and Risque', 'Other Adult Materials', 'Marijuana'];
/////////////////////////////////////////////////////////////////////
// metadata


action.name = 'check';
action.description = 'check site';
action.inputs = {
  'required': ['id'],
  'optional': []
};
action.blockedConnectionTypes = [];
action.outputExample = {};

action.run = function (api, connection, next) {
  var id = validator.toInt(connection.params.id),
      data = {},
      url,
      totalParsers,
      successParsers = 0,
      messageCount = 0;
  var proxyList = _.shuffle(api.proxyList || []);
  var stopped = false;

  var db = mysql.createConnection(api.config.mysql);

  db.connect();

  async.waterfall([

      function (fn) {
        if (proxyList.length) {
          return fn();
        }
        var inter = setInterval(function () {
          if (!api.proxyList || !api.proxyList.length)
            return;
          proxyList = _.shuffle(api.proxyList);
          fn();
          clearInterval(inter);
        }, 200);
      },

      function (fn) {

        db.query('SELECT `url` FROM `analiztask` WHERE `id` = ' + id, function (err, rows, fields) {
          if (err) return fn(err);
          if (!rows[0])
            return fn(new Error('task not found'));
          url = parser.getHostName('http://' + rows[0].url.replace(/https?:\/\//, ''));

          if (!validator.isURL(url)) {
            return fn(new Error('url invalid'));
          }
          data.url = url;
          fn();
        });

      },

      function (fn) {

        async.waterfall([
            function (cb) {

              var success = false;
              //registerParser('categories');

              data.cats = null;

              async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                if (stopped)
                  return fn(new Error('task stopped', 'ETASKSTOPPED'));
                if (!success) {
                  parser.getCategories(url, proxy, function (err, cats) {
                    if (err) {
                      debug && api.log('getCategories ERROR', 'error', err);
                      return fn(null);
                    }
                    success = true;
                    data.cats = cats;
                    fn(true);
                  });
                } else {
                  fn();
                }
              }, function (err) {
                //successPart(null, 'categories');
                debug && api.log('getCategories success ' + success, 'notice');
                if (data.cats) {
                  cb(null);
                } else {
                  cb(err || (success ? null : new Error('error getCategories parse', 'EPARSEGEOIP')));
                }
              });
            },
            // Получение категорий
            function (cb) {

              var cats = data.cats;
              if (cats) {
                data.categories = cats;
                data.category = cats.join(', ');
              } else {
                data.categories = [];
              }
              debug && api.log('cats:', 'notice', data.categories);

              var pieces = tldtools.extract('http://' + url);
              data.siteTld = pieces.tld;
              data.siteName = pieces.domain;

              var time = Date.now();
              debug && api.log('request to ' + 'http://' + url, 'notice');

              var proxy = _.shuffle(proxyList)[0];

              request.get({
                timeout: timeout,
                url: 'http://' + url,
                encoding: 'binary',
				
              }, function (err, res, body) {
                if (err) {
                  debug && api.log(err, 'error', res);
                  return cb(err);
                }
                data.charset = charset(res.headers, body) || jschardet.detect(body).encoding;
                if (data.charset.toLowerCase() != 'utf-8' && data.charset.toLowerCase() != 'utf8') {
                  var iconv = new Iconv(data.charset, 'UTF-8//TRANSLIT//IGNORE');
                  body = iconv.convert(new Buffer(body, 'binary')).toString('utf-8');
                }
                data.time = (
                Date.now() - time) / 1000;
                data.speed = res.headers['content-length'] || body.length;
                data.speed /= data.time;
                data.status = res.statusCode;
                data.server = res.headers.server;
                return cb(null, body);
              }).on('error', function (err) {
                debug && api.log('request to site failed!', 'error', err);
              });
            },
            // проверка на adult содержание
            function (html, cb) {
              if (parser.isAdult(adultList, html, 6) || _.intersection(adultCategories, data.categories).length > 0) {
                debug && api.log('porn content', 'error');
                return cb(new Error('porn content', 444));
              }
              return cb(null, html);
            },
            /*
             * IP resolve
             */
            function (html, done) {
              debug && api.log('check IP', 'notice');
              async.retry(tryCount, function (cb) {
                parser.resolve4(url, function (err, address) {
                  if (err) return cb(err);

                  data.ip = address.toString();
                  cb(err, html);
                });
              }, done);
            },
            // все остальные проверки
            function (html, cb1) {
              data.url = url;
              // 4
              debug && api.log('proxyList', 'notice', proxyList);
              var parsers = [
                /*
                 * PR сайта
                 */
                function (cb) {
                  registerParser('pr');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getPageRank(url, function (err, pr) {
                      if (err) return done(err);
                      data.pagerank = pr;
                      successPart(null, 'pr');
                      done(err);
                    });
                  }, cb);
                }
                /*
                 * Количество гугл картинок
                 */
                , function (cb) {
                  registerParser('google image');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getGoogleImages(url, function (err, count) {
                      if (err) return done(err);
                      data.google_images = count;
                      successPart(null, 'google image');
                      done(err);
                    });
                  }, cb);
                }
                /*
                 * get tags
                 */
                , function (cb) {

                  registerParser('tags');
//                            async.retry(tryCount, function (done) {
                  var $ = cheerio.load(html);
                  data.h1 = $('h1').first().text() || '';
                  data.keywords = $('meta[name="keywords"]').attr('content') || '';
                  data.description = $('meta[name="description"]').attr('content') || '';
                  successPart(null, 'tags');
                  cb();
//                            }, cb);
                }
                /*
                 * get DMOZ
                 */
                , function (cb) {
                  registerParser('dmoz');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.checkInDMOZ(url, function (err, dmoz) {
                      if (err) {
                        debug && api.log('dmoz', 'error', err);
                        return done(err);
                      }
                      data.cat_google = dmoz;
                      successPart(null, 'dmoz');
                      done(err);
                    });
                  }, cb);
                }
                /*
                 * safeBrowsing
                 */
                , function (cb) {
                  registerParser('safe');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.checkSafeBrowsing(url, function (err, val) {
                      if (err) {
                        debug && api.log('safe browsing', 'error', err);
                        return done(err);
                      }
                      data.cat_safebrowsing = val;
                      successPart(null, 'safe');
                      done(err);
                    });
                  }, cb);
                }
                /*
                 * safeBrowsing
                 */
                , function (cb) {
                  registerParser('norton');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.checkInNortonSafeWeb(url, function (err, val) {
                      if (err) {
                        debug && api.log('is norton safe web', 'error', err);
                        return done(err);
                      }
                      data.cat_norton_safe_web = val;
                      successPart(null, 'norton');
                      done(err);
                    });
                  }, cb);
                }
                /*
                 * Sites in IP
                 */
                , function (cb) {
                  registerParser('common ip');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getIpSites(data.ip.split(',')[0], function (err, d) {
                      if (err) {
                        debug && api.log('ip sites ERROR', 'error', err);
                        return done(err);
                      }
                      data.ip_count = d.sitescount;
                      data.ip_count_url = d.lookmore;
                      successPart(null, 'common ip');
                      done(err);
                    });
                  }, cb);
                }
                /*
                 * get NS
                 */
                , function (cb1) {

                  registerParser('ns');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    data.dns_ns = [];
                    var _url = /^.*?\.?([^.]*\.[^.]*)$/.exec(url);

                    parser.resolveNs(_url[1], function (err, nsList) {
                      if (err) {
                        debug && api.log('resolveNS ERROR', 'error', err);
                        return done(err);
                      }
                      nsList = nsList || [];
                      async.each(nsList, function (ns, cb) {
                        if (stopped)
                          return cb(new Error('task stopped', 'ETASKSTOPPED'));
                        var nsData = {
                          'server': ns
                        };
                        parser.resolve4(ns, function (err, address) {
                          if (err) {
                            debug && api.log('resolver ERROR', 'error', err);
                            return cb(err);
                          }
                          if (!address)
                            return cb(null, null);

                          nsData.ip = address.toString();

                          var success = false;
                          async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                            if (stopped)
                              return fn(new Error('task stopped', 'ETASKSTOPPED'));
                            if (!success) {
                              parser.getGeoInfo(nsData.ip, proxy, function (err, d) {
                                if (err) return fn();

                                success = true;
                                nsData.country = d.geoplugin_countryName;
                                data.dns_ns.push(nsData);
                                fn();
                              });
                            } else {
                              fn();
                            }
                          }, function (err) {
                            cb(err || (
                              success ? null : new Error('error geoip parse', 'EPARSEGEOIP')));
                          });
                        });
                      }, function (err) {
                        done(err);
                      });
                    });
                  }, function (err) {
                    successPart(null, 'ns');
                    cb1(err);
                  });
                }
                /*
                 getAlexaRank
                 */
                , function (cb) {
                  registerParser('alexa rank');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getAlexaRank(url, function (err, d) {
                      if (err) {
                        debug && api.log('alexa rank ERROR', 'error', err);
                        return done(err);
                      }
                      data.alexa_rank = d.rank;
                      data.alexa_delta_rank = d.delta;
                      successPart(null, 'alexa rank');
                      done(err);
                    });
                  }, cb);
                }
                , function (cb) {
                  registerParser('facebook');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getSocFacebook(url, function (err, d) {
                      if (err) {
                        debug && api.log('facebook ERROR', 'error', err);
                        return done(err);
                      }
                      if (d) {
                        data.facebook_shares = d[2].replace(/[^\d]/, '');
                        data.facebook_likes = d[3].replace(/[^\d]/, '');
                        data.facebook_comments = d[4].replace(/[^\d]/, '');
                      }
                      successPart(null, 'facebook');
                      done(err);
                    });
                  }, cb);
                }
                , function (cb) {
                  registerParser('twitter');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getSocTweets(url, function (err, d) {
                      if (err) {
                        debug && api.log('twitter ERROR', 'error', err);
                        return done(err);
                      }
                      if (d && d.count) {
                        data.tweets = d.count;
                      }
                      successPart(null, 'twitter');
                      done(err);
                    });
                  }, cb);
                }
                , function (cb) {
                  registerParser('gplus');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getSocGPlus(url, function (err, d) {
                      if (err) {
                        debug && api.log('soc gPlus ERROR', 'error', err);
                        return done(err);
                      }
                      if (d) {
                        data.gplus = d;
                      }
                      successPart(null, 'gplus');
                      done(err);
                    });
                  }, cb);
                }
                , function (cb) {
                  registerParser('wot');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getWot(url, function (err, d) {
                      if (err) {
                        debug && api.log('WOT ERROR', 'error', err);
                        return done(err);
                      }
                      if (d) {
                        data.trust = d[0];
                        data.child = d[1];
                      }
                      successPart(null, 'wot');
                      done(err);
                    });
                  }, cb);
                }
                , function (cb) {
                  registerParser('resources');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getResources(url, function (err, d) {
                      if (err) {
                        debug && api.log('resources ERROR', 'error', err);
                        return done(err);
                      } else {
                        if (d) {
                          data.address = d.id;
                          data.title = d.title;
                          data.score = d.score;
                          data.size = d.pageStats ? d.pageStats.htmlResponseBytes : 0;
                          data.css = d.pageStats ? d.pageStats.cssResponseBytes : 0;
                          data.images = d.pageStats ? d.pageStats.imageResponseBytes : 0;
                          data.javascript = d.pageStats ? d.pageStats.javascriptResponseBytes : 0;
                          data.other = d.pageStats ? d.pageStats.otherResponseBytes : 0;
                        }
                        successPart(null, 'resources');
                        done(err);
                      }
                    });
                  }, cb);
                }
                , function (cb) {
                  registerParser('traffic');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getTraffic(url, function (err, d) {
                      if (err) {
                        debug && api.log('traffic ERROR', 'error', err);
                        return done(err);
                      }
                      if (d) {
                        data.visits = d;
                      }
                      successPart(null, 'traffic');
                      done(err);
                    });
                  }, cb);
                }
//                        , function (cb) {
//                            registerParser('alexa pages');
//                            async.retry(tryCount, function (done) {
//                                parser.getAlexaPages(url, function (err, d) {
//                                    if (err) {
//                                        debug && api.log('alexa pages ERROR', 'error');
//                                        debug && api.log(arguments, 'error');
//                                        return done(err);
//                                    }
//                                    if (d) {
//                                        data.alexa_pages = d[0];
//                                    }
//                                    successPart(null, 'alexa pages');
//                                    done(err);
//                                });
//                            }, cb);
//                        }
                , function (cb) {
                  registerParser('headers');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.getHeaders(url, function (err, d) {
                      if (err) {
                        debug && api.log('headers ERROR', 'error', err);
                        return done(err);
                      }
                      if (d) {
                        data.status = d[0];
                        data.server = d[1];
                      }
                      successPart(null, 'headers');
                      done(err);
                    });
                  }, cb);
                }
                /*
                 * Server location
                 */
                , function (cb) {
                  var success = false;
                  registerParser('location');
                  async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                    if (stopped)
                      return fn(new Error('task stopped', 'ETASKSTOPPED'));
                    if (!success) {
                      parser.getGeoInfo(data.ip.split(',')[0], proxy, function (err, d) {
                        if (err) {
                          debug && api.log('geo info ERROR', 'error', err);
                          return fn();
                        }
                        data.server_countryName = d.geoplugin_countryName;
                        data.server_countryCode = d.geoplugin_countryCode;
                        data.server_city = d.geoplugin_city;
                        data.server_region = d.geoplugin_region;
                        success = true;
                        fn();
                      });
                    } else {
                      fn();
                    }
                  }, function (err) {
                    successPart(null, 'location');
                    debug && api.log('geoIP success ' + success, 'notice');
                    cb(err || (
                      success ? null : new Error('error geoip parse', 'EPARSEGEOIP')));
                  });
                }
                , function (done) {
                  var success = false;
                  registerParser('whois');

                  async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                    if (!success) {
                      parser.parserWhois(url, proxy, function (err, result) {
                        if (err) {

                          debug && api.log("whois ERROR", 'error');
                          debug && api.log(err, 'error');
                          return fn(null);
                        }
                        debug && api.log('whois done!', 'notice');
                        data.registrar = result.registar;
                        try {
                          data.domain_created = dateformat(result.domain_created, 'dd-mmm-yyyy');
                        } catch (e) {
                          data.domain_created = null;
                        }
                        try {
                          data.domain_expires = dateformat(result.domain_expired, 'dd-mmm-yyyy');
                        } catch (e) {
                          data.domain_expires = null;
                        }
                        data.whois = result.whois;
                        success = true;
                        fn(err);
                      });
                    } else {
                      fn();
                    }
                  }, function (err) {
                    successPart(null, 'whois');
                    debug && api.log('whois success ' + success, 'notice');
                    done(err || (
                      success ? null : new Error('error whois parse', 'EPARSEWHOIS')));
                  });
                }
                , function (done) {
                  var success = false;
                  registerParser('ahref');
                  async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                    if (stopped)
                      return fn(new Error('task stopped', 'ETASKSTOPPED'));
                    if (!success)
                      parser.parseAhref(url, 'http://' + proxy, function (err, d) {
                        if (err) {
                          debug && api.log("ahref ERROR", 'error', err);
                          return fn(null);
                        }

                        debug && api.log('ahref done!', 'notice');
                        data.domain_authority = d.domain_authority;
                        data.backlinks_domains = d.backlinks_domains;
                        data.backlinks_gov_domain = d.backlinks_gov_domain;
                        data.backlinks_edu_domain = d.backlinks_edu_domain;
                        data.backlinks_ips = d.backlinks_ips;
                        data.backlinks_subnets = d.backlinks_subnets;
                        data.backlinks_all = d.backlinks_all;
                        data.backlinks_text = d.backlinks_text;
                        data.backlinks_nofollow = d.backlinks_nofollow;
                        data.backlinks_redirect = d.backlinks_redirect;
                        data.backlinks_images = d.backlinks_images;
                        data.backlinks_gov_links = d.backlinks_gov_links;
                        data.backlinks_edu_links = d.backlinks_edu_links;
                        success = true;
                        fn(err);
                      });
                    else
                      fn(null);
                  }, function (err) {
                    successPart(null, 'ahref');
                    debug && api.log('ahrefs success ' + success, 'notice');
                    done(err);
                  });
                }
                , function (done) {
                  var success = false;
                  registerParser('yahoo images');
                  async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                    if (stopped)
                      return fn(new Error('task stopped', 'ETASKSTOPPED'));
                    if (!success)
                      parser.parseYahooImages(url, 'http://' + proxy, function (err, d) {
                        if (err) {
                          debug && api.log("yahoo images ERROR", 'error', err);
                          return fn(null);
                        }

                        debug && api.log('yahoo images done!', 'notice');
                        data.yahoo_images = d;
                        success = true;
                        fn(err);
                      });
                    else
                      fn();
                  }, function (err) {
                    successPart(null, 'yahoo images');
                    done(err);
                  });
                }
                , function (done) {

                  var success = false;
                  registerParser('yahoo search');
                  async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                    if (stopped)
                      return fn(new Error('task stopped', 'ETASKSTOPPED'));
                    if (!success)
                      parser.parseYahooSearch(url, proxy, function (err, d) {
                        if (err) {
                          debug && api.log("yahoo search ERROR", 'error', err);
                          return fn(null);
                        }
                        debug && api.log('yahoo search done', 'notice');
                        data.yahoo_pages = d;
                        success = true;
                        fn(err);
                      });
                    else
                      fn();
                  }, function (err) {
                    successPart(null, 'yahoo search');
                    done(err);
                  });
                }
                /*
                 * getAlexaVisitorsByCountry
                 */
                , function (done) {
                  var success = false;
                  registerParser('alexa');
                  async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                    if (stopped)
                      return fn(new Error('task stopped', 'ETASKSTOPPED'));
                    if (!success)

                      parser.getAlexaVisitorsByCountry(url, function (err, d) {
                        if (err) {
                          debug && api.log('alexa', 'error', err);
                          return fn(err);
                        }
                        data.alexa_visitors_by_country = d.country;
                        data.alexa_pages = d.pages;
                        success = true;
                        fn(err);
                      });
                    else
                      fn();
                  }, function (err) {
                    successPart(null, 'alexa');
                    done(err);
                  });
                }
                , function (done) {
                  var success = false;
                  registerParser('google search');
                  async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                    if (stopped)
                      return fn(new Error('task stopped', 'ETASKSTOPPED'));
                    if (!success)
                      parser.parseGoogleSearch(url, '', 'http://' + proxy, function (err, d) {
                        if (err) {
                          debug && api.log("google search ERROR", 'error', err);
                          return fn(null);
                        }
                        debug && api.log('google search done', 'notice');
                        data.google_pages = d;
                        success = true;
                        fn(err);
                      });
                    else
                      fn();
                  }, function (err) {
                    successPart(null, 'google search');
                    done(err);
                  });
                }
                , function (done) {
                  var success = false;
                  registerParser('google search main');
                  async.eachSeries(_.shuffle(proxyList), function (proxy, fn) {
                    if (stopped)
                      return fn(new Error('task stopped', 'ETASKSTOPPED'));
                    if (!success)
                      parser.parseGoogleSearch(url, '%2F%26', 'http://' + proxy, function (err, d) {
                        if (err) {
                          debug && api.log("google search main page ERROR", 'error', err);
                          return fn(null);
                        }
                        debug && api.log('google search main page done', 'notice');
                        data.google_main_pages = d;
                        success = true;
                        fn(err);
                      });
                    else
                      fn();
                  }, function (err) {
                    successPart(null, 'google search main');
                    done(err);
                  });
                }
                , function (cb) {
                  registerParser('favicon');
                  async.retry(tryCount, function (done) {
                    if (stopped)
                      return done(new Error('task stopped', 'ETASKSTOPPED'));
                    parser.downloadFavicon(url, function (err, d) {
                      if (err) return done(err);
                      if (d) {
                        data.favicon = d;
                      }
                      successPart(null, 'favicon');
                      done(err);
                    });
                  }, cb);
                }
              ];
//                    27
//                    parsers = [];
              totalParsers = parsers.length;
              debug && api.log('START PARALLEL!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', 'notice', totalParsers);
              var timeLeft = 300000;
              var overdue = false;
              var maxTimeout = setTimeout(function () {
                overdue = true;
                debug && api.log('max timeout!', 'error');
                cb1(new Error('max timeout!', 'EMAXTIMEOUT'));
              }, timeLeft);
              async.parallel(
                parsers,
                function (err) {
                  stopped = true;
                  clearTimeout(maxTimeout);
                  debug && api.log('parallel done', 'notice');
                  if (overdue) {
                    debug && api.log('---------------------------------REQUEST TIMEOUT---------------------------------', 'alert');
                    return;
                  }
                  else if (err) {
                    debug && api.log('---------------------------------REQUEST FAILED---------------------------------', 'alert', err);
                  } else {
                    debug && api.log('---------------------------------REQUEST SUCCESS---------------------------------', 'alert');
                  }
                  cb1(err);
                });
            }
          ],
          function (err) {
            if (err) return fn(err);
            saveRecord(data, fn);
          }
        )
        ;
      }
    ],

    function (err) {
      notifier && clearInterval(notifier);

      async.waterfall(
        [
          function (fn) {
            debug && api.log('delete task!', 'debug');
            db.query('DELETE FROM `analiztask` WHERE `id` = ' + id, fn);
            //                    db.query('DELETE FROM `analiztask` WHERE 1<>1', fn);
          }
        ],
        function (dberr) {
          debug && api.log('response', 'notice');
          if (err || dberr) connection.response.error = err ? err.toString() : dberr;

          if (connection.type == 'websocket') {
            connection.response = {
              'redirect': '/website/' + data.url,
              error: connection.response.error
            };
          } else {
            connection.response = {
              success: data,
              error: connection.response.error
            };
          }
          if (connection.type == 'socket') {
            connection.sendMessage(connection.response);
          }
          if (err)
            successPart(err);
          return next(connection);
        });
    }
  );

  var registerParsers = {};

  function registerParser(name) {
    if (registerParsers[name] !== undefined) {
      api.log('ERROR! Redefined function!! name: ' + name + ' count:' + registerParsers[name], 'crit');
    }
    registerParsers[name] = 0;
  }

  if (debug) {
    var isStart = false;
    var notifier = setInterval(function () {
      var incomplete = [];
      if (registerParsers.length) {
        isStart = true;
      }
      _.each(registerParsers, function (e, i) {
        if (e === 0)
          incomplete.push(i);
      });
      if (isStart && incomplete.length === 0) {
        clearInterval(notifier);
      }
      if (incomplete.length > 0) {
        api.log(incomplete.length + ' parsers left: [' + incomplete.join(',') + ']', 'notice');
      }
    }, 5000);
  }

  function successPart(err, name) {
    successParsers++;
    if (debug && name) {
      if (registerParsers[name] === undefined) {
        api.log('ERROR! parser complete before parser registration!! parser: ' + name, 'crit');
      } else if (registerParsers[name] > 0) {
        registerParsers[name]++;
        api.log('ERROR! Recall function!! name: ' + name + ' count:' + registerParsers[name], 'crit');
      } else {
        registerParsers[name]++;
        api.log('parser complete name: ' + name + '. complete: ' + successParsers + '/' + totalParsers, 'notice');
      }
    }
    if (connection.type != 'websocket')
      return false;
    connection.sendMessage({
      increment: 1,
      total: totalParsers,
      error: err ? err.toString() : null,
      successTotal: successParsers,
      messageCount: ++messageCount
    });
    return true;
  }

  function saveRecord(data, fn) {
    async.waterfall([
      function (cb) {
        db.query('SELECT `id` FROM `analiz` WHERE `site` LIKE ' + db.escape(data.url) + '', function (err, rows) {
          if (err) return cb(err);
          if (rows[0] && rows[0].id) {
            db.query('UPDATE `analiz` ' +
              'SET `title` = ' + db.escape(data.title) + ', ' +
              '`site` = ' + db.escape(data.url) + ', ' +
              '`base_analiz` = ' + db.escape(JSON.stringify(data)) + ', ' +
              '`update_date` = UNIX_TIMESTAMP() + 86400, ' +
              '`keywords` = ' + db.escape(data.keywords) + ' ' +
              'WHERE `id` = ' + rows[0].id,
              function (err, res) {
                cb(err, rows[0].id);
              }
            );

          } else {

            db.query('INSERT INTO `analiz` ' +
              'SET `title` = ' + db.escape(data.title) + ', ' +
              '`site` = ' + db.escape(data.url) + ', ' +
              '`base_analiz` = ' + db.escape(JSON.stringify(data)) + ', ' +
              '`create_date` = UNIX_TIMESTAMP(), ' +
              '`update_date` = UNIX_TIMESTAMP() + 86400, ' +
              '`keywords` = ' + db.escape(data.keywords) + ' ' +
              '',
              function (err, res) {
                cb(err, !err ? res.insertId : null);
              }
            );
          }
        });
      }, function (analizId, cb) {

        db.query('DELETE FROM `analiz_category` WHERE `analiz_id` = ' + db.escape(analizId), function (err, res) {
          if (err) return cb(err);
          async.each(data.categories || [], function (category, done) {
            getCategoyId(category, function (err, categoryId) {
              if (err) return done(err);
              db.query('INSERT INTO `analiz_category` SET `category_id` = ' + categoryId + ', `analiz_id` = ' + analizId, done);
            });
          }, function (err) {
            cb(err);
            // todo! удалить задачу
          });
        });
      }
    ], function (err) {
      fn(err);
    });
  }

  function getCategoyId(category, cb) {
    db.query('SELECT `id` FROM `category` WHERE `name` LIKE ' + db.escape(category) + '', function (err, rows) {
      if (err) return cb(err);
      if (!rows[0]) {
        db.query('INSERT INTO `category` SET `name` = ' + db.escape(category) + '', function (err, res) {
          cb(err, res.insertId);
        });
      } else {
        cb(err, rows[0].id);
      }
    });
  }

  function download(url, dest, cb) {
    var file = fs.createWriteStream(dest);
    http.get(url, function (response) {
      response.pipe(file);
      file.on('finish', function () {
        file.close(cb);
      });
    }).on('error', function (err) {
      fs.unlink(dest);
      if (cb)
        cb(err);
    });
  }
};

exports.action = action;



