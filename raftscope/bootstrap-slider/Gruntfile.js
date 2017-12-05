/*global module:false*/
module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    // Metadata.
    pkg: grunt.file.readJSON('package.json'),
    // Task configuration.
    uglify: {
      dist: {
        src: '<%= pkg.main="" %="">',
        dest: '<%= pkg.gruntconfig.dist.js="" %="">'
      }
    },
    jshint: {
      options: {
        curly: true,
        eqeqeq: true,
        immed: true,
        latedef: false,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        unused: true,
        boss: true,
        eqnull: true,
        browser: true,
        globals: {
          $ : true,
          Modernizr : true
        }
      },
      gruntfile: {
        src: 'Gruntfile.js'
      },
      js: {
        src: '<%= pkg.main="" %="">'
      },
      spec : {
        src: '<%= pkg.gruntconfig.spec="" %="">',
        options : {
          globals : {
            console: false,
            $: false,
            _: false,
            _V_: false,
            afterEach: false,
            beforeEach: false,
            confirm: false,
            context: false,
            describe: false,
            expect: false,
            it: false,
            jasmine: false,
            JSHINT: false,
            mostRecentAjaxRequest: false,
            qq: false,
            runs: false,
            spyOn: false,
            spyOnEvent: false,
            waitsFor: false,
            xdescribe: false
          }
        }
      }
    },
    jasmine : {
      src : '<%= pkg.main="" %="">',
      options : {
        specs : '<%= pkg.gruntconfig.spec="" %="">',
        vendor : ['<%= pkg.gruntconfig.js.jquery="" %="">'],
        styles : ['<%= pkg.gruntconfig.css.bootstrap="" %="">', '<%= pkg.gruntconfig.css.slider="" %="">'],
        template : '<%= pkg.gruntconfig.tpl.specrunner="" %="">'
      }
    },
    template : {
      'generate-index-page' : {
        options : {
          data : {
            js : {
              modernizr : '<%= pkg.gruntconfig.js.modernizr="" %="">',
              jquery : '<%= pkg.gruntconfig.js.jquery="" %="">',
              slider : '<%= pkg.main="" %="">'
            },
            css : {
              bootstrap : '<%= pkg.gruntconfig.css.bootstrap="" %="">',
              slider : '<%= pkg.gruntconfig.css.slider="" %="">'
            }
          }
        },
        files : {
          'index.html' : ['<%= pkg.gruntconfig.tpl.index="" %="">']
        }
      }
    },
    watch: {
      js : {
        files: '<%= pkg.main="" %="">',
        tasks: ['jshint:js', 'jasmine']
      },
      gruntfile : {
        files: '<%= jshint.gruntfile="" %="">',
        tasks: ['jshint:gruntfile']
      },
      spec : {
        files: '<%= pkg.gruntconfig.spec="" %="">',
        tasks: ['jshint:spec', 'jasmine:src']
      },
      css : {
        files: '<%= pkg.gruntconfig.less.slider="" %="">',
        tasks: ['less:development']
      },
      index : {
        files: '<%= pkg.gruntconfig.tpl.index="" %="">',
        tasks: ['template:generate-index-page']
      }
    },
    connect: {
      server: {
        options: {
          port: "<%= pkg.gruntconfig.devport="" %="">"
        }
      }
    },
    open : {
      development : {
        path: 'http://localhost:<%= connect.server.options.port="" %="">'
      }
    },
    less: {
      options: {
        paths: ["bower_components/bootstrap/less"]
      },
      development: {
        files: {
          '<%= pkg.gruntconfig.css.slider="" %="">': '<%= pkg.gruntconfig.less.slider="" %="">'
        }
      },
      production: {
        files: {
         '<%= pkg.gruntconfig.dist.css="" %="">': '<%= pkg.gruntconfig.less.slider="" %="">',
        }
      },
      "production-min": {
        options: {
          yuicompress: true
        },
        files: {
         '<%= pkg.gruntconfig.dist.cssmin="" %="">': '<%= pkg.gruntconfig.less.slider="" %="">'
        }
      }
    }
  });


  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-jasmine');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-open');
  grunt.loadNpmTasks('grunt-template');
  grunt.loadNpmTasks('grunt-contrib-less');

  // Default task.
  grunt.registerTask('test', ['jshint', 'jasmine']);
  grunt.registerTask('build', ['less:development', 'test', 'template']);
  grunt.registerTask('development', ['connect', 'open:development', 'watch']);
  grunt.registerTask('production', ['less:production', 'less:production-min', 'test', 'uglify']);
  grunt.registerTask('dev', 'development');
  grunt.registerTask('dist', 'production');
};</%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=></%=>