var debug = false,
    timeout = 60000,
    request = require('request').defaults({
        timeout: timeout,
        followAllRedirects: true,
        headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux i686 (x86_64)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.107 Safari/537.36'
        }
    }),
    fs = require('fs'),
    cheerio = require('cheerio'),
    async = require('async'),
    dns = require('native-dns'),
    pagerank = require('pagerank'),
    PHPUnserialize = require('php-unserialize'),
    socks = require('socks5-http-client/lib/Agent'),
    path = require('path'),
    _ = require('underscore'),
    faviconImageDir = path.normalize(__dirname + '/../../botalizer.com/datafavicon/img'),
    socksS = require('socks5-https-client/lib/Agent');


var parser = {
    resolveNs: function (url, cb) {
        var success = false;
        var address = [];
        async.eachSeries(['8.8.8.8', '8.8.4.4', '77.88.8.8', '77.88.8.1'], function (serv, fn) {
            if (!success) {
                var req = dns.Request({
                    question: dns.Question({
                        name: url,
                        type: 'NS'
                    }),
                    server: {
                        address: serv,
                        port: 53,
                        type: 'udp'
                    },
                    timeout: timeout * 2
                });
                req.on('timeout', function () {
                    fn(new Error('DNS TIMEOUT1', 'ETIMEDOUT'));
                });

                req.on('message', function (err, answer) {
                    if (err) return fn(err);
                    answer.answer.forEach(function (a) {
                        address.push(a.data);
                    });
                    success = true;
                    fn(err);
                });
                req.send();
            } else {
                fn();
            }
        }, function (err) {
            cb(err, address);
        });
    },
    resolve4: function (url, cb) {
        var success = false;

        var address = [];
        async.eachSeries(['8.8.8.8', '8.8.4.4', '77.88.8.8', '77.88.8.1'], function (serv, fn) {
            if (!success) {
                var req = dns.Request({
                    question: dns.Question({
                        name: url,
                        type: 'A'
                    }),
                    server: {
                        address: serv,
                        port: 53,
                        type: 'udp'
                    },
                    timeout: timeout * 2
                });
                req.on('timeout', function () {
                    fn(new Error('DNS TIMEOUT2', 'ETIMEDOUT'));
                });

                req.on('message', function (err, answer) {
                    if (err) return fn(err);
                    answer.answer.forEach(function (a) {
                        address.push(a.address);
                    });
                    success = true;
                    fn(err);
                });
                req.send();
            } else {
                fn();
            }
        }, function (err) {
            cb(err, address);
        });
    },
    parserWhois: function (url, proxy, fn) {
        var e = new Error('error parse whois', 'EPARSEWHOIS'),
            self = this,
            userAgentList = [
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Googlebot/2.1 (+http://www.googlebot.com/bot.html)',
            'Googlebot/2.1 (+http://www.google.com/bot.html)',
            'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
            'Mozilla/5.0 (compatible; YandexImages/3.0; +http://yandex.com/bots)',
            'YahooSeeker/1.2 (compatible; Mozilla 4.0; MSIE 5.5; yahooseeker at yahoo-inc dot com ; http://help.yahoo.com/help/us/shop/merchant/)'
        ];


        debug && console.log('request to ' + 'http://' + url + '.ipaddress.com over proxy (' + proxy + ')' + proxy.replace(/http:\/\//, '').split(':')[0] + ' on ' + proxy.replace(/http:\/\//, '').split(':')[1] + ' port');
        request.get({
            headers: {
                'User-Agent': _.sample(userAgentList, 1)[0],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
                'Pragma': 'no-cache',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
                'Cookie': '__utma=10930924.2011709640.1410284653.1411730691.1411747841.3; __utmc=10930924; __utmz=10930924.1410284653.1.1.utmcsr=(direct)|utmccn=(direct)|utmcmd=(none); __atuvc=2%7C39'
            },
            url: 'http://' + url + '.ipaddress.com',
            agent: new socks({
                socksHost: proxy.replace(/http:\/\//, '').split(':')[0],
                socksPort: proxy.replace(/http:\/\//, '').split(':')[1]
            }),
            rejectUnauthorized: false,
            timeout: timeout
        },function (err, res, body) {
            if (err) {
                console.log(err);
                return fn(err);
            }
            if(/http:\/\/ipaddress\.com\/img\/loading\.gif/.test(body)){
                var code = /jstream\/([^']+)/.exec(body.replace(/[\r\n]/, ''));
                if(code && code[1])
                    return setTimeout(function(){self.parseSubWhois(url, code[1], proxy, fn)}, 1000);
                fn(e);
            }

            var $ = cheerio.load(body);
            var d = {};
            d.domain_created = $('.created').next().text();

            d.domain_expired = $('.expires').next().text();

            d.registar = $('.registrar').next().text();

            d.whois = $('.whoisserver').next().text();
            console.log(d);
            fn(err, d);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },

    parseSubWhois : function(url, code, proxy, fn){

        var e = new Error('error parse whois', 'EPARSEWHOIS');

        debug && console.log('request to ' + 'http://' + url + '.ipaddress.com/jstream/' + code + ' over proxy (' + proxy + ')' + proxy.replace(/http:\/\//, '').split(':')[0] + ' on ' + proxy.replace(/http:\/\//, '').split(':')[1] + ' port');
        request.get({
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.6,en;q=0.4',
                'Pragma': 'no-cache',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            },
            url: 'http://' + url + '.ipaddress.com/jstream/' + code,
            agent: new socks({
                socksHost: proxy.replace(/http:\/\//, '').split(':')[0],
                socksPort: proxy.replace(/http:\/\//, '').split(':')[1]
            }),
            timeout: timeout
        },function (err, res, body) {
            if (err) {
                console.log(err);
                return fn(err);
            }
            console.log(body);
            var $ = cheerio.load(body);
            var d = {};
            d.domain_created = $('.created').next().text();

            d.domain_expired = $('.expires').next().text();

            d.registar = $('.registrar').next().text();

            d.whois = $('.whoisserver').next().text();
            console.log(d);
            fn(err, d);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    parseAhref: function (url, proxy, fn) {

        var e = new Error('error parse ahrefs', 'EPARSE');
        debug && console.log('request to ' + 'https://ru.ahrefs.com/labs/batch-analysis/?batch_requests=' + url + ' over proxy ' + proxy);
        request.get({
            rejectUnauthorized: false,
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux i686 (x86_64)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.107 Safari/537.36'
            },
            timeout: timeout,
            agent: new socksS({
                socksHost: proxy.replace(/http:\/\//, '').split(':')[0],
                socksPort: proxy.replace(/http:\/\//, '').split(':')[1]
            }),
            //url: 'https://ru.ahrefs.com/labs/batch-analysis/?batch_requests=' + url
            url: 'https://ru.ahrefs.com/site-explorer/overview/subdomains?target=' + url
        },function (err, res, body) {
            if (err) {
                return fn(err);
            }

            var
              match,
              re = /<strong\sid\=\"ahrefs_rank\"\sclass\=\"url\-rank\">([^<]*)<\/strong>/g;

            if ((match = re.exec(body)) !== null) {
                data.domain_authority = parseInt(match[1]);
            }

            fn(null, data);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    parseYahooImages: function (url, proxy, fn) {
        var e = new Error('error parse yahoo images', 'EPARSE');

        debug && console.log('request to ' + 'http://images.search.yahoo.com/search/images?p=site%3A' + url + ' over proxy ' + proxy);
        async.waterfall([
            function (cb) {
                request.get({
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (X11; Linux i686 (x86_64)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.107 Safari/537.36'
                    },
                    timeout: timeout,
                    agent: new socks({
                        socksHost: proxy.replace(/http:\/\//, '').split(':')[0],
                        socksPort: proxy.replace(/http:\/\//, '').split(':')[1]
                    }),
                    rejectUnauthorized: false,
                    url: 'http://images.search.yahoo.com/search/images?p=site%3A' + url
                }, cb).on('error', function (err) {
                    debug && console.log('request error!');
                });
            },
            function (res, body, cb) {
                cb(null, body);
//            updateCaptcha(body, proxy, cb);
            }
        ], function (err, body) {
            if (err)
                return fn(err);

            if (/We did not find results/.test(body))
                return fn(null, '0');

            var match = body.match(/"total":([^}]+)}/gmi);
            if (!match || !match[0])
                return fn(e);

            match = /"total":([^}]+)}/.exec(match[0]);
            if (match && match[1])
                return fn(null, match[1].replace(/[^0-9]/g, ''));
            return fn(null, '0');
        });
    },
    parseYahooSearch: function (url, proxy, fn) {
        var e = new Error('error parse yahoo', 'EPARSE');

        debug && console.log('request to ' + 'http://search.yahoo.com/search?p=site%3A' + url + ' over proxy ' + proxy);
        async.waterfall([
            function (cb) {

                request.get({
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (X11; Linux i686 (x86_64)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.107 Safari/537.36'
                    },
                    timeout: timeout,
                    agent: new socks({
                        socksHost: proxy.replace(/http:\/\//, '').split(':')[0],
                        socksPort: proxy.replace(/http:\/\//, '').split(':')[1]
                    }),
                    rejectUnauthorized: false,
                    url: 'http://search.yahoo.com/search?p=site%3A' + url
                }, cb).on('error', function (err) {
                    debug && console.log('request error!');
                });
            },
            function (res, body, cb) {
                cb(null, body);
//            updateCaptcha(body, proxy, cb);
            }
        ], function (err, body) {
            if (err)
                return fn(err);

            if (/Unable to process request at this time/.test(body)) {
                debug && console.log('Unable to process request at this time');
                return fn(e);
            }

            if (/We did not find results/.test(body)) {
                debug && console.log('We did not find results');
                return fn(null, '0');
            }

            var match = body.match(/>([^>]+) results<\/span>/gmi);
            if (!match || !match[0]) {
                debug && console.log('match fail');
                return fn(e);
            }

            match = />([^>]+) results<\/span>/.exec(match[0]);
            if (match && match[1]) {
                return fn(null, match[1].replace(/[^\d]/g, ''));
            }
            return fn(null, '0');
        });
    },
    parseGoogleSearch: function (url, add, proxy, fn) {
        var e = new Error('error parse google', 'EPARSE');
        async.waterfall([
            function (cb) {
                debug && console.log('request to ' + 'https://www.google.com/search?filter=0&amp;hl=en&q=site:' + url + add + ' over ' + proxy);
                request.get({
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (X11; Linux i686 (x86_64)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.107 Safari/537.36'
                    },
                    timeout: timeout,
                    agent: new socksS({
                        socksHost: proxy.replace(/http:\/\//, '').split(':')[0],
                        socksPort: proxy.replace(/http:\/\//, '').split(':')[1]
                    }),
                    rejectUnauthorized: false,
                    url: 'https://www.google.com/search?filter=0&amp;hl=en&q=site:' + url + add
                }, cb).on('error', function (err) {
                    debug && console.log('request error!');
                });
            },
            function (res, body, cb) {
                updateCaptcha(body, proxy, cb);
            }
        ], function (err, body) {

            if (err) {
                debug && console.log(err);
                return fn(err);
            }

            var match = body.match(/<div id="resultStats">([^<]+)</gmi);
            if (!match || !match[0])
                return fn(e);

            match = /<div id="resultStats">([^<]+)</.exec(match[0].replace(/[\r\n]/, ''));
            if (match && match[1]) {
                return fn(null, match[1].replace(/[^\d]/g, ''));
            }
            return fn(null, '0');
        });
    },
    downloadFavicon: function (url, cb) {

        request.get({
            timeout: timeout,
            url: 'http://g.etfv.co/http://' + url
        },function (err, res, body) {
            var ext;
            if (err) return cb(err);
            switch (res.headers['content-type']) {
                case "image/png":
                    ext = '.png';
                    break;
                case "image/gif":
                    ext = '.gif';
                    break;
                case "image/x-icon":
                    ext = '.ico';
                    break;
                default:
                    ext = '.ico';
                    break;
            }
            debug && console.log('download favicon:');
            debug && console.log(faviconImageDir + '/' + url + ext);
            fs.writeFile(faviconImageDir + '/' + url + ext, body, function (err) {
                cb(err, faviconImageDir + '/' + url + ext);
            });
        }).on('error', function (err) {
            debug && console.log('FAVICON request error!');
            debug && console.log(err);
        });
    },
    getHeaders: function (url, cb) {
        request.head({
            timeout: timeout,
            url: 'http://' + url
        },function (err, res, body) {
            if (err) return cb(err);

            cb(err, [
                res.statusCode,
                res.headers.server || null
            ]);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getAlexaPages: function (url, cb) {
         request.get({
             timeout: timeout,
             url: 'http://www.alexa.com/siteinfo/' + url
         },function (err, res, body) {
           if (err) return cb(err);

             body = body.replace(/[\n\r]/, '');
             var alexa = /<h4 class="metrics-title">Daily Pageviews per Visitor<\/h4>[^<]+<div>[^<]+<strong class="metrics-data align-vmiddle">(.*)<\/strong>/.exec(body);
            if (alexa && alexa[1])
                return cb(null, alexa[1].replace(/[^\d]/gmi, ''));
     return cb(null, null);
         }).on('error', function (err) {
             debug && console.log('request error!');
            debug && console.log(err);
        });
   },
    getTraffic: function (url, cb) {
        request.get({
            timeout: timeout,
            url: 'http://www.trafficestimate.com/' + url
        },function (err, res, body) {
            if (err) return cb(err);

            var visits = /has received an estimated (.*) visits/.exec(body.replace(/[\n\r]/, ''));

            if (visits && visits[1])
         return cb(null, parseInt(visits[1].replace(/[^\d]/gmi, '')) / 30); 
            return cb(null, null);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getResources: function (url, cb) {
        debug && console.log('request to ' + 'https://www.googleapis.com/pagespeedonline/v1/runPagespeed?url=http://' + url + '&key=AIzaSyDBXcaMK3CHYbC8mAylWJPQeXBNFEbVwgw');
        request.get({
            timeout: timeout * 2,
            rejectUnauthorized: false,
            url: 'https://www.googleapis.com/pagespeedonline/v1/runPagespeed?url=http://' + url + '&key=AIzaSyDBXcaMK3CHYbC8mAylWJPQeXBNFEbVwgw'
        },function (err, res, body) {
            if (err) return cb(err);
            cb(err, JSON.parse(body));
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },

    getWot : function(url, cb){

        debug && console.log('request to ' + 'http://api.mywot.com/0.4/public_link_json2?hosts=' + url + '/&key=066842dbf1769ac3a47a3861494f76f32a980b81');
        request.get({
            timeout: timeout,
//            rejectUnauthorized: false,
            url: 'http://api.mywot.com/0.4/public_link_json2?hosts=' + url + '/&key=066842dbf1769ac3a47a3861494f76f32a980b81'
        },function (err, res, body) {
            if (err) return cb(err);
            try{
                var json = JSON.parse(body);
                cb(err, [json[url][0][0], json[url][4][0]]);
            }catch (e){
                cb(null, null);
            }
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getSocGPlus: function (url, cb) {
        request.post({
            timeout: timeout,
            headers: {
                'content-type': 'application/json'
            },
            url: 'https://clients6.google.com/rpc?key=AIzaSyCKSbrvQasunBoV16zDH9R33D88CeLr9gQ',
            body: '[{"method" :"pos.plusones.get","id":"p","params":{"nolog":true,"id":"http://' + url + '","source":"widget","userId":"@viewer","groupId":"@self"},"jsonrpc":"2.0","key":"p","apiVersion":"v1"}]'
        },function (err, res, body) {
            if (err) return cb(err);
            try {
                if (typeof(body) == 'string') {
                    body = JSON.parse(body);
                }
                if (typeof(body) == 'object') {
                    return cb(null, body[0].result.metadata.globalCounts.count);
                }
            } catch (e) {
                return cb(null, null);
            }
            return cb(null, null);

        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getSocTweets: function (url, cb) {
        request.get({
            timeout: timeout,
            url: 'http://urls.api.twitter.com/1/urls/count.json?url=www.' + url
        },function (err, res, body) {
            if (err) return cb(err);
            cb(err, JSON.parse(body));
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getSocFacebook: function (url, cb) {
        request.get({
            timeout: timeout,
            url: 'http://api.facebook.com/method/links.getStats?format=xml&urls=' + url
        },function (err, res, body) {
            if (err) return cb(err);
            var match = body.replace(/[\r\n]/mig, '').match(/>([\s\S]*?)<\//mig);
            match =  match ? match.map(function (e, i) {
                return e.replace(/[   <>share_countlike_countcomment_count\/]/mig, '');
            }) : [];
            cb(err, match);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getW3CCSSValidator: function (url, cb) {
        debug && console.log('request to ' + 'http://jigsaw.w3.org/css-validator/validator?lang=en&uri=' + url);

        request.get('http://jigsaw.w3.org/css-validator/validator?lang=en&uri=' + url,
            function (err, res, body) {
                if (err) {
                    return cb(err);
                }
                body = body.replace(/[\r\n]/mig, '');
                var warnings = /"#warnings">Warnings \((\d+)\)<\/a>/gmi.exec(body);
                if (warnings && warnings[1])
                    warnings = warnings[1];
                else
                    warnings = null;

                var errors = /"#errors">Errors \((\d+)\)<\/a>/gmi.exec(body);
                if (errors && errors[1])
                    errors = errors[1];
                else
                    errors = null;
                cb(null, [ errors, warnings]);
            }).on('error', function (err) {
                debug && console.log('css validator request error!');
                debug && console.log(err);
            });
    }, 

    getW3CHTMLValidator: function (url, cb) {
        request.get({
                headers: {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux i686 (x86_64)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.107 Safari/537.36'
                },
                url: 'http://validator.w3.org/check?uri=' + url
            },
            function (err, res, body) {
                if (err) return cb(err);

                body = body.replace(/[\r\n]/, '');

                var doctype = /<td>(.+)<\/td><td><select id="doctype" name="doctype">/.exec(body);
                doctype = doctype && doctype[1] ? doctype[1] : null;

                var encode = /<td>(.+)<\/td><td><select name="charset" id="charset">/.exec(body);
                encode = encode && encode[1] ? encode[1] : null;

                var errors = /class="invalid">\s+(.+) Errors, (.+) warning/.exec(body);
                errors = errors && errors[1] ? errors[1] : null;
                var warnings = errors && errors[2] ? errors[2] : null;

                return cb(null, [errors, warnings, doctype, encode]);

            }).on('error', function (err) {
                debug && console.log('request error!');
                debug && console.log(err);
            });
    },
    getContentWords: function (url, cb) {
        request.get({
            timeout: timeout,
            url: 'http://getinfo.botalizer.com/tools/tools/contentcheck/' + url
        },function (err, res, body) {
            if (err) return cb(err);
            var match = body.replace(/[\r\n]/mig, '').match(/>([\s\S]*?)<\//mig);
            cb(err, match ? match.map(function (e, i) {
                return e.replace(/[<>\/]/mig, '');
            }) : []);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getPageLinks: function (url, cb) {
        request.get({
            timeout: timeout,
            url: 'http://getinfo.botalizer.com/tools/tools/checkurllinks/' + url
        },function (err, res, body) {
            if (err) return cb(err);
            var match = body.replace(/[\r\n]/mig, '').match(/>([\s\S]*?)<\//mig);
            cb(err, match ? match.map(function (e, i) {
                return e.replace(/[<>\/]/mig, '');
            }) : []);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getAlexaRank: function (url, cb) {
        request.get({
            timeout: timeout,
            url: "http://data.alexa.com/data?cli=10&dat=snbamz&url=" + url
        },function (err, res, body) {
            if (err) return cb(err);
            var $ = cheerio.load(body);
            cb(err, {
                'rank': $('POPULARITY').attr('text'),
                'delta': $('RANK').attr('delta')
            });
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    isAdult: function (regExpList, html, maxCount) {
        maxCount = maxCount || 3;
        var matches = 0;
        regExpList.forEach(function (el) {
            if (el.test(html)){
                matches++;
            }
        });
        return matches >= maxCount;
    },
    getCategories: function (url, proxy, cb) {
//    return cb(null, ['Technical & Business Forums']);
        debug && console.log('get categories', proxy);
        request.get({
          timeout: timeout,
          url: 'http://fortiguard.com/ip_rep/index.php?data=' + url,
          agent: new socks({
            socksHost: proxy.replace(/http:\/\//, '').split(':')[0],
            socksPort: proxy.replace(/http:\/\//, '').split(':')[1]
          })
        },function (err, res, body) {
            if (err) return cb(err);
            var cats = body.replace(/[\r\n]/mig, '').match(/Category: ([\s\S]*?)<\//);
            if (cats && cats[1])
                return cb(null, cats[1].split(',').map(function(e){return e.trim()}));
            return cb(null, false);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getGoogleImages: function (url, cb) {

        request.get({
            timeout: timeout,
            url: 'http://ajax.googleapis.com/ajax/services/search/images?v=1.0&filter=0&q=site:' + encodeURI(url)
        },function (err, res, body) {
            if (err) return cb(err);
            var count = 0;
            if (!err && body) {
                var json = JSON.parse(body);
                if (json && json.responseData && json.responseData.cursor)
                    count = json.responseData.cursor.estimatedResultCount;
            }
            cb(err, count);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getPageRank: function (url, cb) {
        new pagerank(url, cb);
    },
    getHostName: function (url) {
        var match = url.match(/:\/\/(www[0-9]?\.)?(.[^\/:]+)/i);
        if (match != null && match.length > 2 &&
            typeof match[2] === 'string' && match[2].length > 0) {
            return match[2];
        }
        else {
            return null;
        }
    },
    checkInDMOZ: function (url, cb) {
        request.get({
            timeout: timeout,
            url: "http://www.dmoz.org/search?q=" + url
        },function (err, res, body) {
            if (err) return cb(err);
            var match = body.match(/<strong>DMOZ Sites<\/strong>\s*<small>\(\d+\-\d+ of (\d+)\)<\/small>/i);
            if (match && match[1]) {
                cb(err, match[1] || 0);
            } else
                cb(0);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getYahoo: function (url, cb) {

        request.get({
            timeout: timeout,
            url: "http://dir.search.yahoo.com/search?p=" + url
        },function (err, res, body) {
            if (err) return cb(err);
            cb(err, /<div class="res">/.test(body) ? 1 : 0);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    checkSafeBrowsing: function (url, cb) {

        request.get({
            timeout: timeout,
            url: "http://www.google.com/safebrowsing/diagnostic?hl=en&site=" + url
        },function (err, res, body) {
            if (err) return cb(err);
            cb(err, /This site is not currently listed as suspicious/.test(body) ? 1 : 0);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    checkInNortonSafeWeb: function (url, cb) {

        request.get({
            timeout: timeout,
            url: "http://safeweb.norton.com/heartbleed?ulang=eng&url=" + url
        },function (err, res, body) {
            if (err) return cb(err);
            cb(err, /is not vulnerable to the Heartbleed attack/.test(body) ? 1 : 0);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getAlexaVisitorsByCountry: function (url, cb) {

        try {
            request({
                    url: "http://www.alexa.com/siteinfo/" + url,
                    headers: {
                        'Cookie': 'rpt=%21; optimizelyEndUserId=oeu1410284849831r0.5688870034646243; session_www_alexa_com=61e99e0c-c3b1-4090-9b67-59108908e973; rpt=%21; jwtScribr=eJyrVsrNUbIyNDDQUSopBjJMDA2MLCxMzCxrAVpfBn0.1fCUvmgF8X7y_EPDcTMd8Tiz9IhRlCTGTaznIHXCoCU; session_www_alexa_com_daily=1410284869; lv=1410284868; migrated=true; optimizelySegments=%7B%22176053510%22%3A%22gc%22%2C%22176317345%22%3A%22direct%22%2C%22176317346%22%3A%22false%22%7D; optimizelyBuckets=%7B%221713750029%22%3A%221712780030%22%7D; _ga=GA1.2.1023589305.1410284850; __asc=c1f43b2c14750101542d5c04e3f; __auc=be71c08f1485b870c3cd4489cf8; optimizelyPendingLogEvents=%5B%5D'
                    }
                },
                function (err, res, body) {
                    if (err) return cb(err);
                    var data = {};
                    var $ = cheerio.load(body);
                    data.country = [];
                    $("#demographics_div_country_table").find("tr").each(function (i, e) {
                        if (!$(e).find("td").eq(0).text())
                            return;
                        if (!/No data available for this site/.test($(e).find("td").eq(0).text())) {
                            data.country.push({
                                "country": $(e).find("td").eq(0).text().replace(/^\s+|\s+$/g, ''),
                                "percent": $(e).find("td").eq(1).text()
                            });
                        }
                    });

                    var alexa = /<h4 class="metrics-title">Daily Pageviews per Visitor<\/h4>[^<]+<div>[^<]+<strong class="metrics-data align-vmiddle">(.*)<\/strong>/.exec(body);

                    if (alexa && alexa[1])
                        data.pages = alexa[1].replace(/[^\d]/gmi, '');
                    else
                        data.pages = null;
                    cb(err, data);
                }).on('error', function (err) {
                    debug && console.log('request error!');
                });
        } catch (e) {
            cb(e);
        }
    },
    getGeoInfo: function (ip, proxy, cb) {

        debug && console.log('request to ' + "http://www.geoplugin.net/php.gp?ip=" + ip + "&base_currency=USD");
        request.get({
            timeout: timeout,
            url: "http://www.geoplugin.net/php.gp?ip=" + ip + "&base_currency=USD",
            agent: new socks({
                socksHost: proxy.replace(/http:\/\//, '').split(':')[0],
                socksPort: proxy.replace(/http:\/\//, '').split(':')[1]
            })
        },function (err, res, body) {
            if (err) return cb(err);

            cb(err, PHPUnserialize.unserialize(body));
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    },
    getIpSites: function (ip, cb) {
        var data = {};
        data.lookmore = 'http://www.bing.com/search?FORM=MSNH&q=IP:' + ip;

        request.get({
            timeout: timeout,
            url: data.lookmore
        },function (err, res, body) {
            if (err) return cb(err);
            var match = body.match(/<span class="sb_count">(.*?)<\/span>/mi);
            data.sitescount = parseInt(match ? (match[0].replace(/[^\d]/g, '') || '0') : '0');
            cb(err, data);
        }).on('error', function (err) {
            debug && console.log('request error!');
            debug && console.log(err);
        });
    }
};

function updateCaptcha(body, proxy, fn) {

    var e = new Error('error parse captcha', 'EPARSECAPTCHA');
    if (/sorry\/image/.test(body)) {
        debug && console.log('captcha!');
        return fn(e);
        /*var captchaCode = body.match(/name="id" value="(\d+)/mi);
         if (!captchaCode || !captchaCode[1])
         return fn(e);

         captchaCode = captchaCode[1];

         var captchaUrl = 'https://www.google.com/sorry/image?id=' + captchaCode + '&amp;hl=en';

         recognize(captchaUrl, rucaptchaKey, function (err, result) {
         debug && console.log(arguments);
         if (err)
         return fn(err);
         if (!result)
         return fn(e);
         var captchaContinue = /name="continue" value="([^"]+)"/.exec(body.replace(/\r|\n/g, ''));

         debug && console.log('captcha: ' + result);

         if (!captchaContinue || !captchaContinue[1])
         return fn(e);
         debug && console.log(captchaContinue[1].replace(/&amp;amp;/, '&'));
         captchaContinue = decodeURIComponent(captchaContinue[1].replace(/&amp;/, '%26').replace(/%2F%26/, 'SPECIAL_TOKEN'));
         debug && console.log('captcha continue = ' + captchaContinue);
         debug && console.log('request to ');
         debug && console.log('https://ipv4.google.com/sorry/CaptchaRedirect?continue=' + encodeURIComponent(captchaContinue).replace(/SPECIAL_TOKEN/, '%2F%26') + '&id=' + captchaCode + '&captcha=' + result + '&submit=Submit');
         request.get({
         timeout: timeout,
         url: 'https://ipv4.google.com/sorry/CaptchaRedirect?continue=' + encodeURIComponent(captchaContinue).replace(/SPECIAL_TOKEN/, '%2F%26') + '&id=' + captchaCode + '&captcha=' + result + '&submit=Submit',
         agent: new socksS({             socksHost: proxy.replace(/http:\/\//, '').split(':')[0], socksPort: proxy.replace(/http:\/\//, '').split(':')[1]         })
         },
         function (err, res, body) {
         debug && console.log(res.path);
         debug && console.log(body);
         if (err)
         return fn(err);
         if (!body)
         return fn(e);
         if (/"\/sorry\/image/.test(body)) {
         debug && console.log('wrong type!');
         return fn(e);
         }
         debug && console.log('АНТИКАПЧА ПРОЙДЕНА!!!!!');
         return fn(null, body);
         }).on('error', function (err) {
         debug && console.log('request error!');
         });
         });*/
    } else if (/but your computer or network may be sending automated queries/.test(body)) {
        debug && console.log('your computer or network may be sending automated queries');
        return fn(new Error('bot detected', 'EPARSECAPTCHA'));
    } else
        return fn(null, body);
}
parser.updateCaptcha = updateCaptcha;

module.exports = parser;