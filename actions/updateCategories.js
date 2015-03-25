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

  run: function(api, connection, next){
    console.log('run update Categories');
    next(connection, true);
  }
};