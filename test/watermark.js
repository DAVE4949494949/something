/**
 * Created by dmitrymaklygin on 30.04.15.
 */
var gm = require('gm');
gm(__dirname + '/../images/google.jpeg')
  .draw(['image Over 307,307 410,410 ' + __dirname + '/../images/watermark.png'])
  .write(__dirname + '/../images/google-output.jpeg', function(e){
    console.log(e||'done'); // What would you like to do here?
  });
