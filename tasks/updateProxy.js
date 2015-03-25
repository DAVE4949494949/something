var request = require('request');
exports.updateProxy = {
    name: 'updateProxy',
    description: 'update proxy',
    frequency: 20000,
    queue: 'default',
    plugins: [],
    pluginOptions: {},

    run: function (api, params, next) {

        if(!api.proxyList)
            api.proxyList = [];
        request.get({
            url: 'http://api.best-proxies.ru/feeds/proxylist.txt?key=Sh4CwfWiKanjo91Yc9Cq&type=socks5&unique=1&google=1&response=500&limit=100'
        }, function (err, res, body) {
            if (err)
                return next(err);
            api.proxyList = body.replace(/\r/g, '').split("\n").filter(function (e) {
                return e;
            });
            next(null, true);
        });
    }
};