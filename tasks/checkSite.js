var http = require('http');
exports.getCategories = {
    name: 'getCategories',
    description: 'get category  url',
    frequency: 0,
    queue: 'default',
    plugins: [],
    pluginOptions: {},

    run: function (api, params, next) {
        /**
         *
         $content = @Url::file_get_contents_new('http://getinfo.botalizer.com/parsers/category.php?s=' . $url);
         preg_match_all('/>(.*)</', $content, $category);
         return $category[1];
         */
        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        api.log(params);
    }
};