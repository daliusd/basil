var browserify = require('browserify');
var tsify = require('tsify');
var exorcist = require('exorcist');

browserify({ debug: true })
    .add('worker.ts')
    .plugin(tsify, { noImplicitAny: true })
    .transform('uglifyify', { global: true })
    .bundle()
    .pipe(exorcist('../../saffron/public/js/worker.js.map'))
    .on('error', function(error) {
        console.error(error.toString());
    })
    .pipe(process.stdout);
