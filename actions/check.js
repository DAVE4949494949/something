var action = {},
    https = require('https'),
    request = require('request'),
    async = require('async'),
    fs = require('fs'),
    path = require('path'),
    dns = require('dns'),
    cheerio = require('cheerio'),
    PHPUnserialize = require('php-unserialize'),
    validator = require('validator'),
    mysql = require('mysql'),
    _ = require('underscore'),
    pagerank = require('pagerank'),
    dataShotDir = path.normalize(__dirname + '/../../datashots/img'),
    faviconImageDir = path.normalize(__dirname + '/../../datafavicon/img'),
    adultList = require('fs')
        .readFileSync(__dirname + '/../adult.txt').toString()
        .split("\n")
        .map(function (el) {
            return el.replace(/\r/, '');
        }).filter(function (el) {
            return el.length > 0;
        }).map(function (el) {
            return new RegExp(el);
        }),
    adultCategories = ['Sexual Materials', 'Pornography'];
/////////////////////////////////////////////////////////////////////
// metadata

var db = mysql.createConnection({
    host: 'localhost',
    user: 'demo',
    password: 'passdemo',
    database: 'demo'
});

db.connect();

action.name = 'check';
action.description = 'check site';
action.inputs = {
    'required': ['id'],
    'optional': []
};
action.blockedConnectionTypes = [];
action.outputExample = {
//    "status_analiz": true,
//    "url": "yahoo.com",
//    "ip": "98.138.253.109",
//    "screen_url": "http:\/\/api.s-shot.ru\/1024x1024\/PNG\/1024\/KEYMVBW0OQ9A3I66WLB\/Z100\/T0\/D0\/JS1\/FS1\/?yahoo.com",
//    "time": 0.944363,
//    "speed": 78866,
//    "h1": "",
//    "cat_google": "11507",
//    "cat_yahoo": 1,
//    "cat_safebrowsing": 1,
//    "alexa_visitors_by_country": [
//        {
//            "country": "United States",
//            "percent": "32.7%"
//        }
//    ],
//    "server_countryName": "United States",
//    "server_countryCode": "US",
//    "server_city": "Sunnyvale",
//    "server_region": "CA",
//    "ip_count": "0",
//    "ip_count_url": "http:\/\/www.bing.com\/search?FORM=MSNH&q=IP:98.138.253.109",
//    "ip_hosting": "ir2.fp.vip.bf1.yahoo.com",
//    "keywords": "yahoo, yahoo home page, yahoo homepage, yahoo search, yahoo mail, yahoo messenger, yahoo games, news, finance, sport, entertainment",
//    "description": "A new welcome to Yahoo. The new Yahoo experience makes it easier to discover the news and information that you care about most. It's the web ordered for you.",
//    "dns_ns": [
//        {
//            "server": "ns6.yahoo.com",
//            "ip": "121.101.144.139",
//            "country": "India"
//        }
//    ],
//    "google_images": "84100",
//    "pagerank": "9\n",
//    "alexa_rank": "4",
//    "alexa_delta_rank": "+0",
//    "in_indexing_links": null,
//    "in_noindex_links": null,
//    "out_indexing_links": null,
//    "out_noindex_links": null,
//    "symbols": "0",
//    "words": "0",
//    "unique_words": "0",
//    "stopwords": "0",
//    "content_percent": "0",
//    "html_errors": "265",
//    "html_warnings": "1",
//    "doctype": "HTML5",
//    "charset": "utf-8",
//    "css_errors": "580",
//    "css_warnings": "188",
//    "category": "Portals",
//    "facebook_shares": "166729",
//    "facebook_likes": "78602",
//    "facebook_comments": "37655",
//    "tweets": "7346786",
//    "gplus": "259149",
//    "address": "https:\/\/www.yahoo.com\/",
//    "title": "Yahoo",
//    "score": "82",
//    "size": "441294",
//    "css": "232615",
//    "images": "350674",
//    "javascript": "776436",
//    "other": "3204",
//    "visits": "249035967",
//    "alexa_pages": "738",
//    "status": "301 Redirect\r",
//    "server": "ATS\r",
//    "google_pages": "176000000",
//    "google_main_pages": "81300000",
//    "yahoo_pages": "546000000",
//    "yahoo_images": "3120000",
//    "domain_authority": "81",
//    "backlinks_domains": "356600",
//    "backlinks_gov_domain": "803",
//    "backlinks_edu_domain": "7138",
//    "backlinks_ips": "215928",
//    "backlinks_subnets": "91375",
//    "backlinks_all": "105198211",
//    "backlinks_text": "101953914",
//    "backlinks_nofollow": "28423260",
//    "backlinks_redirect": "3129380",
//    "backlinks_images": "34116234",
//    "backlinks_gov_links": "138891",
//    "backlinks_edu_links": "1844272",
//    "favicon": "\/datafavicon\/img\/yahoo.com.ico"
};

action.run = function (api, connection, next) {

    var id = validator.toInt(connection.params.id),
        data = {},
        url,
        totalParsers,
        successParsers,
        messageCount = 0;

    async.waterfall([
        function (fn) {

            db.query('SELECT `url` FROM `analiztask` WHERE `id` = ' + id, function (err, rows, fields) {
                if (err) return fn(err);
                if (!rows[0])
                    return fn(new Error('task not found'));
                url = getHostName('http://' + rows[0].url.replace(/https?:\/\//, ''));

                if (!validator.isURL(url)) {
                    return fn(new Error('url invalid'));
                }
                data.url = url;
                fn();
            });
        }, function (fn) {

            async.waterfall([
                function (cb) {
                    getCategories(url, cb);
                },
                // Получение категорий
                function (cats, cb) {
                    if (!cats)
                        return cb(new Error('categories do not received'));

                    if (cats) {
                        data.categories = cats;
                        data.category = cats.join(', ');
                        var time = Date.now();
                        request.get('http://' + url,function (err, res, body) {
                            if (err) return cb(err);
                            data.time = (Date.now() - time) / 1000;
                            data.speed = res.headers['content-length'] || body.length;
//                            data.speed = body.length / data.time;
                            data.speed /= data.time;
                            return cb(null, body);
                        }).on('error', function (err) {
                            return cb(err);
                        });
                    }
                },
                // проверка на adult содержание
                function (html, cb) {
                    if (isAdult(adultList, html, 3) || _.intersection(adultCategories, data.categories).length > 0) {
                        return cb(new Error('porn content', 444));
                    }
                    return cb(null, html);
                },
                /*
                 * IP resolve
                 */
                function (html, cb) {
                    dns.resolve4(url, function (err, address) {
                        if (err) return cb(err);
                        data.ip = address.toString();
                        cb(err, html);
                    });
                },
                // все остальные проверки
                function (html, cb) {
                    data.url = url;
                    // 4
                    var parsers = [
                        /*
                         * PR сайта
                         */
                        function (done) {
                            getPageRank(url, function (err, pr) {
                                if (err) return done(err);
                                data.pagerank = pr;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * Количество гугл картинок
                         */
                        function (done) {
                            getGoogleImages(url, function (err, count) {
                                if (err) return done(err);
                                data.google_images = count;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * Постер сайта
                         */
                        function (done) {
                            data.screen_url = 'http://api.s-shot.ru/1024x1024/PNG/1024/KEYMVBW0OQ9A3I66WLB/Z100/T0/D0/JS1/FS1/?' + url;
                            request(data.screen_url).pipe(fs.createWriteStream(dataShotDir + '/' + url + '.png'));
                            successPart();
                            done();
                        },
                        /*
                         * get tags
                         */
                        function (done) {

                            var $ = cheerio.load(html);
                            data.h1 = $('h1').first().text() || '';
                            data.keywords = $('meta[name="keywords"]').attr('content') || '';
                            data.description = $('meta[name="description"]').attr('content') || '';
                            successPart();
                            done();
                        },
                        /*
                         * get DMOZ
                         */
                        function (done) {
                            checkInDMOZ(url, function (err, dmoz) {
                                if (err) return done(err);
                                data.cat_google = dmoz;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * get Yahoo
                         */
                        function (done) {
                            getYahoo(url, function (err, yahoo) {
                                if (err) return done(err);
                                data.cat_yahoo = yahoo;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * safeBrowsing
                         */
                        function (done) {
                            checkSafeBrowsing(url, function (err, val) {
                                if (err) return done(err);
                                data.cat_safebrowsing = val;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * safeBrowsing
                         */
                        function (done) {
                            checkInNortonSafeWeb(url, function (err, val) {
                                if (err) return done(err);
                                data.cat_norton_safe_web = val;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * getAlexaVisitorsByCountry
                         */
                        function (done) {
                            getAlexaVisitorsByCountry(url, function (err, d) {
                                if (err) return done(err);
                                data.alexa_visitors_by_country = d;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * Server location
                         */
                        function (done) {
                            getGeoInfo(data.ip, function (err, d) {
                                if (err) return done(err);
                                data.server_countryName = d.geoplugin_countryName;
                                data.server_countryCode = d.geoplugin_countryCode;
                                data.server_city = d.geoplugin_city;
                                data.server_region = d.geoplugin_region;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * Sites in IP
                         */
                        function (done) {
                            getIpSites(data.ip, function (err, d) {
                                if (err) return done(err);
                                data.ip_count = d.sitescount;
                                data.ip_count_url = d.lookmore;
                                successPart();
                                done(err);
                            });
                        },
                        /*
                         * get Host Domain
                         * не используется
                         */
                        function (done) {
                            dns.reverse(data.ip, function (err, domains) {
                                if (!err)
                                    data.ip_hosting = domains[0] || data.ip;
                                successPart();
                                done(null);
                            });
                        },
                        /*
                         * get NS
                         */
                        function (done) {

                            data.dns_ns = [];

                            dns.resolveNs(url, function (err, nsList) {
                                if (err) return done(err);

                                nsList = nsList || [];
                                async.each(nsList, function (ns, cb) {
                                    var nsData = {
                                        'server': ns
                                    };
                                    dns.resolve(ns, 'A', function (err, address) {
                                        nsData.ip = address.toString();
                                        if (err) return cb(err);

                                        getGeoInfo(nsData.ip, function (err, d) {
                                            if (err) return cb(err);

                                            nsData.county = d.geoplugin_countryName;
                                            data.dns_ns.push(nsData);
                                            cb(err, nsData);
                                        });
                                    });
                                }, function (err) {
                                    successPart();
                                    done(err);
                                });
                            });
                        },
                        /*
                         getAlexaRank
                         */
                        function (done) {
                            getAlexaRank(url, function (err, d) {
                                if (err) return done(err);
                                data.alexa_rank = d.rank;
                                data.alexa_delta_rank = d.delta;
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getPageLinks(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.in_indexing_links = d[0];
                                    data.in_noindex_links = d[1];
                                    data.out_indexing_links = d[2];
                                    data.out_noindex_links = d[3];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getContentWords(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.symbols = d[1];
                                    data.words = d[2];
                                    data.unique_words = d[4];
                                    data.stopwords = d[5];
                                    data.content_percent = d[6];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getW3CHTMLValidator(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.html_errors = d[0];
                                    data.html_warnings = d[1];
                                    data.doctype = d[2];
                                    data.charset = d[3];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getW3CCSSValidator(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.css_errors = d[0];
                                    data.css_warnings = d[1];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getSocFacebook(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.facebook_shares = d[2];
                                    data.facebook_likes = d[3];
                                    data.facebook_comments = d[4];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getSocTweets(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.tweets = d;
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getSocGPlus(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.gplus = d[0];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getResources(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.address = d.id;
                                    data.title = d.title;
                                    data.score = d.score;
                                    data.size = d.pageStats.htmlResponseBytes;
                                    data.css = d.pageStats.cssResponseBytes;
                                    data.images = d.pageStats.imageResponseBytes;
                                    data.javascript = d.pageStats.javascriptResponseBytes;
                                    data.other = d.pageStats.otherResponseBytes;
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getTraffic(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.visits = d[0];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getAlexaPages(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.alexa_pages = d[0];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getHeaders(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.status = d[0];
                                    data.server = d[1];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            getIndexBacklinksWithoutProxy(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.google_pages = d[0];
                                    data.google_main_pages = d[1];
                                    data.yahoo_pages = d[2];
                                    data.yahoo_images = d[3];
                                    data.domain_authority = d[4];
                                    data.backlinks_domains = d[6];
                                    data.backlinks_gov_domain = d[7];
                                    data.backlinks_edu_domain = d[8];
                                    data.backlinks_ips = d[9];
                                    data.backlinks_subnets = d[10];
                                    data.backlinks_all = d[11];
                                    data.backlinks_text = d[12];
                                    data.backlinks_nofollow = d[13];
                                    data.backlinks_redirect = d[14];
                                    data.backlinks_images = d[15];
                                    data.backlinks_gov_links = d[18];
                                    data.backlinks_edu_links = d[19];
                                }
                                successPart();
                                done(err);
                            });
                        },
                        function (done) {
                            downloadFavicon(url, function (err, d) {
                                if (err) return done(err);
                                if (d) {
                                    data.favicon = d;
                                }
                                successPart();
                                done(err);
                            });
                        }
                    ];
                    // 27
                    totalParsers = parsers.length;
                    async.parallel(
                        parsers,
                        function (err) {
                            cb(err);
                        });
                }
            ],
                function (err) {
                    if (err) return fn(err);
                    saveRecord(data, fn);
                }
            );
        },
        // delete task
        function (fn) {
            db.query('DELETE FROM `analiztask` WHERE `id` = ' + id, fn);
        }
    ], function (err) {
        if (err) connection.response.error = err.toString();

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
        if (err)
            successPart(err);
        return next(connection);
    });
    function successPart(err) {
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
};

exports.action = action;

function saveRecord(data, fn) {

    async.waterfall([
        function (cb) {
            db.query('SELECT `id` FROM `analiz` WHERE `site` LIKE ' + db.escape(data.url) + '', function (err, rows) {
                if (err) return cb(err);
                if (rows[0] && rows[0].id) {

                    db.query('UPDATE `analiz` ' +
                        'SET `title` = ' + db.escape(data.title) + ', ' +
                        '`site` = ' + db.escape(data.url) + '", ' +
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

function saveAnalizCategory(id, category, cb) {

    /*
     R::setStrictTyping(false);
     R::exec('DELETE FROM `analiz_category` WHERE `analiz_id` = ?', array(intval($id)));
     $categories = explode(',', $category);
     foreach ($categories as $cat) {
     if (trim($cat))
     R::exec('INSERT INTO `analiz_category` SET `category_id` = ?, `analiz_id` = ?', array(self::getCategoryId(trim($cat)), $id));
     }
     */
}

function downloadFavicon(url, cb) {

    request.get('http://g.etfv.co/http://' + url, function (err, res, body) {
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
        fs.writeFile(faviconImageDir + '/' + url + ext, body, function (err) {
            cb(err, faviconImageDir + '/' + url + ext);
        });
    });
}

function getIndexBacklinksWithoutProxy(url, cb) {
    request.get('http://withoutproxy.botalysis.com/check/' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
        ;
    });
}

function getHeaders(url, cb) {
    request.get('http://getinfo.botalysis.com/parsers/headers.php?s=' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getAlexaPages(url, cb) {
    request.get('http://getinfo.botalysis.com/parsers/alexa.php?s=' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getTraffic(url, cb) {
    request.get('http://getinfo.botalysis.com/parsers/traffic.php?s=' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getResources(url, cb) {
    request.get('https://www.googleapis.com/pagespeedonline/v1/runPagespeed?url=http://' + url + '&key=AIzaSyDBXcaMK3CHYbC8mAylWJPQeXBNFEbVwgw', function (err, res, body) {
        if (err) return cb(err);
        cb(err, JSON.parse(body));
    });
}

function getSocGPlus(url, cb) {
    request.get('http://getinfo.botalysis.com/parsers/google_plus.php?s=' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getSocTweets(url, cb) {
    request.get('http://urls.api.twitter.com/1/urls/count.json?url=www.' + url, function (err, res, body) {
        if (err) return cb(err);
        cb(err, JSON.parse(body));
    });
}

function getSocFacebook(url, cb) {
    request.get('http://api.facebook.com/method/links.getStats?format=xml&urls=' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getW3CCSSValidator(url, cb) {
    request.get('http://getinfo.botalysis.com/parsers/cssvalidator.php?s=' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getW3CHTMLValidator(url, cb) {
    request.get('http://getinfo.botalysis.com/parsers/htmlvalidator.php?s=' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getContentWords(url, cb) {
    request.get('http://getinfo.botalysis.com/tools/tools/contentcheck/' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getPageLinks(url, cb) {
    request.get('http://getinfo.botalysis.com/tools/tools/checkurllinks/' + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/>(.*)</mig);
        cb(err, match.map(function (e, i) {
            return e.replace(/[<>]/mig, '');
        }));
    });
}

function getAlexaRank(url, cb) {
    request.get("http://data.alexa.com/data?cli=10&dat=snbamz&url=" + url, function (err, res, body) {
        if (err) return cb(err);
        var $ = cheerio.load(body);
        cb(err, {
            'rank': $('POPULARITY').attr('text'),
            'delta': $('RANK').attr('delta')
        });
    });
}

function isAdult(regExpList, html, maxCount) {
    maxCount = maxCount || 3;
    var matches = 0;
    regExpList.forEach(function (el) {
        if (el.test(html))
            matches++;
    });
    return matches >= maxCount;
}

/**
 * Массив категорий, присущих сайту
 * @param url
 * @param cb
 */
function getCategories(url, cb) {
//    return cb(null, ['Technical & Business Forums']);
    request.get('http://getinfo.botalysis.com/parsers/category.php?s=' + url,function (err, res, body) {
        if (err) return cb(err);
        var cats = body.match(/>(.*)</);
        if (cats[1])
            return cb(null, cats[1].split(','));
        return cb(null, false);
    }).on('error', function (err) {
        return cb(err);
    });
}

/**
 * Получение количества индексируемых ссылок в Google;
 * @param url string
 * @param cb Function
 */
function getGoogleImages(url, cb) {

    request.get('http://ajax.googleapis.com/ajax/services/search/images?v=1.0&filter=0&q=site:' + encodeURI(url), function (err, res, body) {
        if (err) return cb(err);
        var count = 0;
        if (!err && body) {
            var json = JSON.parse(body);
            if (json)
                count = json.responseData.cursor.estimatedResultCount;
        }
        cb(err, count);
    });
}

/**
 * Получение значения Page Rang;
 * @param url
 * @param cb Function
 * @returns void
 */
function getPageRank(url, cb) {
    new pagerank(url, cb);
}

function getGoogleLinks(url, cb) {
    /**
     * Количество ссылок на страницы из Google
     * Комплект <seo анализ сайта>
     * @param type $host
     * @return int
     *
     static function getGoogleLinks($host)
     {
         $content = self::file_get_contents_new('http://ajax.googleapis.com/ajax/services/' . 'search/web?v=1.0&filter=0&q='
         . urlencode($host));
         $data = json_decode($content);
         if (isset($data->responseData->cursor->estimatedResultCount)) {
             return \intval($data->responseData->cursor->estimatedResultCount);
         }
         return 0;
     }
     */
    return null;
}

function getHostName(url) {
    var match = url.match(/:\/\/(www[0-9]?\.)?(.[^\/:]+)/i);
    if (match != null && match.length > 2 &&
        typeof match[2] === 'string' && match[2].length > 0) {
        return match[2];
    }
    else {
        return null;
    }
}

function checkInDMOZ(url, cb) {
    request.get("http://www.dmoz.org/search?q=" + url, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/<strong>DMOZ Sites<\/strong>\s*<small>\(\d+\-\d+ of (\d+)\)<\/small>/i);
        cb(err, match[1] || 0);
    });
}

function getYahoo(url, cb) {

    request.get("http://dir.search.yahoo.com/search?p=" + url, function (err, res, body) {
        if (err) return cb(err);
        cb(err, /<div class="res">/.test(body) ? 1 : 0);
    });
}

function checkSafeBrowsing(url, cb) {

    request.get("http://www.google.com/safebrowsing/diagnostic?hl=en&site=" + url, function (err, res, body) {
        if (err) return cb(err);
        cb(err, /This site is not currently listed as suspicious/.test(body) ? 1 : 0);
    });
}

function checkInNortonSafeWeb(url, cb) {

    request.get("http://safeweb.norton.com/heartbleed?ulang=eng&url=" + url, function (err, res, body) {
        if (err) return cb(err);
        cb(err, /is not vulnerable to the Heartbleed attack/.test(body) ? 1 : 0);
    });
}

function getAlexaVisitorsByCountry(url, cb) {

    try {
        request({
                url: "http://www.alexa.com/siteinfo/" + url,
                headers: {
                    'Cookie': 'rpt=%21; optimizelyEndUserId=oeu1405797533627r0.14135225908830762; session_www_alexa_com=0cf78ecd-9e44-49da-89cd-ee8e056f0332; rpt=%21; jwtScribr=eJyrVsrNUbIyNNBRKikG0iYGphYGhkCqFgBUnQY6.VFyNgDiiuN_JjGBe5qvhpM8OQjmoP-GxOZE7BL8-Tms; session_www_alexa_com_daily=1405797540; lv=1405797540; migrated=true; optimizelySegments=%7B%22176053510%22%3A%22gc%22%2C%22176317345%22%3A%22direct%22%2C%22176317346%22%3A%22false%22%7D; optimizelyBuckets=%7B%7D; _ga=GA1.2.1339216243.1405797537; __asc=c1f43b2c14750101542d5c04e3f; __auc=c1f43b2c14750101542d5c04e3f; optimizelyPendingLogEvents=%5B%22n%3Dhttp%253A%252F%252Fwww.alexa.com%252Fsiteinfo%252Fgoogle.com%26u%3Doeu1405797533627r0.14135225908830762%26wxhr%3Dtrue%26t%3D1405797540698%26f%3D1471040775%22%5D'
                }
//                jar: request.jar().setCookie(request.cookie('rpt=%21; optimizelyEndUserId=oeu1405797533627r0.14135225908830762; session_www_alexa_com=0cf78ecd-9e44-49da-89cd-ee8e056f0332; rpt=%21; jwtScribr=eJyrVsrNUbIyNNBRKikG0iYGphYGhkCqFgBUnQY6.VFyNgDiiuN_JjGBe5qvhpM8OQjmoP-GxOZE7BL8-Tms; session_www_alexa_com_daily=1405797540; lv=1405797540; migrated=true; optimizelySegments=%7B%22176053510%22%3A%22gc%22%2C%22176317345%22%3A%22direct%22%2C%22176317346%22%3A%22false%22%7D; optimizelyBuckets=%7B%7D; _ga=GA1.2.1339216243.1405797537; __asc=c1f43b2c14750101542d5c04e3f; __auc=c1f43b2c14750101542d5c04e3f; optimizelyPendingLogEvents=%5B%22n%3Dhttp%253A%252F%252Fwww.alexa.com%252Fsiteinfo%252Fgoogle.com%26u%3Doeu1405797533627r0.14135225908830762%26wxhr%3Dtrue%26t%3D1405797540698%26f%3D1471040775%22%5D')
//                    , "http://www.alexa.com/siteinfo/" + url)
            },
            function (err, res, body) {
                if (err) return cb(err);
                var data = [];
                var $ = cheerio.load(body);
                $("#demographics_div_country_table").find("tr").each(function (i, e) {
                    if (!$(e).find("td").eq(0).text())
                        return;
                    data.push({
                        "country": $(e).find("td").eq(0).text(),
                        "percent": $(e).find("td").eq(1).text()
                    });
                });
                cb(err, data);
            });
    } catch (e) {
        cb(e);
    }
}

function getGeoInfo(ip, cb) {
    request.get("http://www.geoplugin.net/php.gp?ip=" + ip + "&base_currency=USD", function (err, res, body) {
        if (err) return cb(err);
        cb(err, PHPUnserialize.unserialize(body));
    });
}

function getIpSites(ip, cb) {
    var data = {};
    data.lookmore = 'http://www.bing.com/search?FORM=MSNH&q=IP:' + ip;

    request.get(data.lookmore, function (err, res, body) {
        if (err) return cb(err);
        var match = body.match(/<span class="sb_count">(.*?)<\/span>/mi);
        data.sitescount = parseInt(match[0].replace(/[^\d]/g, '')) || '0';
        cb(err, data);
    });
}