const gulp = require('gulp')
const gutil = require('gulp-util')
const mocha = require('gulp-mocha')

gulp.task('default', ['mocha'], () => gulp.watch(['CouchDbChangeHundler.js', 'test/**'], ['mocha']))

gulp.task('mocha', () =>
  gulp.src(['test/*.js'], {read: false})
    .pipe(mocha({
      globals: {
        should: require('should')
      },
      reporter: 'list'
    }))
    .on('error', gutil.log)
)
