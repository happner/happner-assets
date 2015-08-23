module.exports = Assets;

var debug = require('debug')('happngin-assets');
var promise = require('when').promise;
var parallel = require('when/parallel');
var sequence = require('when/sequence');
var request = require('request');
var fs = require('fs');
var md5 = require('md5');
var devscript = require('./devscript');
var minifyJS = require('uglify-js').minify;
var zlib = require('zlib');
var CleanCSS = require('clean-css');
var minifyHTML = require('html-minifier').minify;

function Assets() {}

Assets.prototype.js = function($happn, req, res) {
  if (!$happn.assetReady) {
    $happn.assetQueue = $happn.assetQueue || [];
    $happn.assetQueue.push({type:'js', req:req, res:res});
    debug('js() queue length: %d', $happn.assetQueue.length);
    return Assets.load($happn);
  }
  Assets.reply($happn, 'js', req, res);
}

Assets.prototype.css = function($happn, req, res) {
  if (!$happn.assetReady) {
    $happn.assetQueue = $happn.assetQueue || [];
    $happn.assetQueue.push({type:'css', req:req, res:res});
    debug('css() queue length: %d', $happn.assetQueue.length);
    return Assets.load($happn);
  }
  Assets.reply($happn, 'css', req, res);
}

Assets.prototype.html = function($happn, req, res) {
  if (!$happn.assetReady) {
    $happn.assetQueue = $happn.assetQueue || [];
    $happn.assetQueue.push({type:'html', req:req, res:res});
    debug('html() queue length: %d', $happn.assetQueue.length);
    return Assets.load($happn);
  }
  Assets.reply($happn, 'html', req, res);
}

Assets.reply = function(happn, type, req, res) {
  if (!happn.assetCache[type][req.url]) {
    res.statusCode = 404;
    debug('reply() %s missing for %s', type, req.url);
    return res.end();
  }

  happn.assetCache[type][req.url].get()
  .then(function(script) {

    if (script.checksum) {
      if (req.headers['if-none-match'] == script.checksum) {
        debug('reply() %s from cache for %s', type, req.url);
        res.statusCode = 304;
        return res.end();
      }
    }

    var header = {
      'Content-Type': 'text/javascript',
      'Cache-Control': "max-age=0",
      'ETag': script.checksum
    }

    if (script.gzip) {
      header['Content-Encoding'] = 'gzip';
    }

    res.writeHead(200, header);
    debug('jsReply() %s non cache for %s', type, req.url);
    res.end(script.data);

  })
  .catch(function(err) {
    console.error(err.stack);
    res.statusCode = 500;
    res.end();
  })
}

Assets.dequeue = function(happn) {
  var waiting;
  while(waiting = happn.assetQueue.shift()) {
    Assets.reply(happn, waiting.type, waiting.req, waiting.res);
  }
}

Assets.load = function(happn) {
  if (happn.assetLoading) {
    debug('load() pending for %d seconds', (
      Date.now() - happn.assetLoadingStart) / 1000
    );
    return;
  }

  var env = process.env.NODE_ENV;
  var isprd = (env == 'production' || env == 'prd');
  happn.env = isprd ? 'production' : 'development';
  happn.assetCache = {
    js: {},
    css: {},
    html: {},
  };
  happn.assetRaw = {
    js: [],
    css: [],
    html: [],
  }

  happn.assetLoading = true;
  happn.assetLoadingStart = Date.now();
  happn.config.masks = happn.config.masks.sort(function(a, b) {
    // longest to shortest
    if (a.length < b.length) return 1;
    if (a.length > b.length) return -1;
    return 0;
  });

  parallel(['js', 'css', 'html'].map(function(type){
    return function() {
      var i = 0
      var list = happn.config[type] || [];
      return sequence(list.map(function(location) {
        return function() {
          if (location.indexOf('http') == 0)
            return Assets.loadWeb(happn, type, i++, location);
          return Assets.loadFile(happn, type, i++, location);
        }
      }))      
    }
  }))
  .then(
    function() {
      Assets.process(happn)
      .then(function() {
        happn.assetLoading = false;
        happn.assetReady = true;
        Assets.dequeue(happn);
      })
    },
    function(err) {
      console.error(err.stack);
      process.exit(1);  // BANG! faulty assets, can't function!
    }
  )
}

Assets.loadWeb = function(happn, type, i, url) {
  return promise(function(resolve, reject) {
    debug('loadWeb() %s %d %s', type, i, url)

    var mini;
    var result = function(err, response, body) {
      if (err) return reject(err);
      if (response.statusCode != 200)
        return reject(
          new Error('ASSETS - Non-200 statusCode for ' + url)
        );
      if (happn.env !== 'production') {
        happn.assetRaw[type][i] = ['web', i, url];
        return resolve({
          checksum: md5(body), 
          data: body
        });
      }
      happn.assetRaw[type][i] = ['web', i, url, md5(body), body];
      resolve();
    }

    if (happn.env == 'production') {
      var match1 = new RegExp('\\.' + type + '$');
      var match2 = new RegExp('\\.min\\.' + type + '$');
      if (url.match(match1) && !url.match(match2)) {
        mini = url.replace(match1, '.min.js');
        return request(mini, function(err, response, body) {
          if (err || response.statusCode !== 200) {
            return request(url, result);
          }
          url = mini;
          debug('got mini', mini);
          result(err, response, body);
        });
      }
    }
    request(url, result);
  });
}

Assets.loadFile = function(happn, type, i, file) {
  return promise(function(resolve, reject) {
    debug('loadFile() %s %d %s', type, i, file)

    var mini;
    var result = function(err, buf) {
      if (err) {
        err.message = 'ASSETS - ' + err.message;
        return reject(err);
      }
      if (happn.env !== 'production') {
        happn.assetRaw.js[i] = ['file', i, file];
        return resolve({
          checksum: md5(buf),
          data: buf.toString()
        });
      }
      happn.assetRaw.js[i] = ['file', i, file, md5(buf), buf.toString()];
      resolve(); 
    }

    if (happn.env == 'production') {
      if (file.match(/\.js$/) && !file.match(/\.min\.js$/)) {
        mini = file.replace(/\.js$/, '.min.js');
        return fs.readFile(mini, function(err, buf) {
          if (err) return fs.readFile(file, result);
          file = mini;
          debug('got mini', mini);
          result(err, buf);
        });
      }
    }
    fs.readFile(file, result);

  });
}

Assets.process = function(happn) {
  return parallel(['js', 'css', 'html'].map(
    function(type) {
      return function() {
        return Assets[happn.env](type, happn)
      }
    }
  ));
}

Assets.production = function(type, happn) {
  debug('build PRODUCTION %s assets', type);
  return promise(function(resolve, reject) {
    var checksum;
    var content = '';
    var masks = happn.config.masks;
    var match = new RegExp('\\.min\\.' + type);

    if (type == 'html') {
      content = 'var script,body=document.getElementsByTagName(\'body\')[0];';
    }

    happn.assetRaw[type].forEach(function(parts) {
      var mini;
      var data = parts[4];
      var url = parts[2];
      var path;
      for (var i = 0; i < masks.length; i++) {
        if (url.indexOf(masks[i]) == 0) {
          path = url.replace(masks[i], '');
          if (path[0] != '/') path = '/' + path;
        }
      }
      if (!path) {
        return reject(new Error('Missing mask for ' + url));
      }

      if (!url.match(match)) {
        debug('minify %s', url);
        if (type == 'js') {
          mini = minifyJS(data, {fromString: true});
          content += '\n' + mini.code;
          return;
        }
        if (type == 'css') {
          mini = new CleanCSS().minify(data).styles;
          content += '\n' + mini;
          return;
        }
      }
      if (type == 'html') {
        data = minifyHTML(data, {
          removeComments: true,
          collapseWhitespace: true
        });
        content += 'script=document.createElement(\'script\');';
        content += 'script.id=\''+ path +'\';'
        content += 'script.type=\'text/ng-template\';'
        content += 'script.text = \''+  data.replace(/'/g, "\\'") + '\';';
        content += 'body.appendChild(script);'

      } else {
        content += '\n' + data;
      }
    });

    checksum = md5(content);

    zlib.gzip(content, function(err, zipped) {
      if (err) {
        console.error(err);
        return process.exit(1);
      }
      happn.assetCache[type]['/'] = {
        get: function() {
          return promise(function(resolve, reject) {
            resolve({
              checksum: checksum,
              data: zipped,
              gzip: true,
            })
          })
        }
      }
      resolve();
    });
  });
}

Assets.development = function(type, happn) {
  debug('build DEVELOPMENT assets');
  var masks = happn.config.masks;
  var list = [];
  var i = 0;
  if (type == 'js') {
    return promise(function(resolve, reject) {
      happn.assetRaw.js.forEach(function(parts) {

        var source = parts[0];
        var seq = parts[1];
        var url = parts[2];
        var path;
        for (var i = 0; i < masks.length; i++) {
          if (url.indexOf(masks[i]) == 0) {
            path = url.replace(masks[i], '');
            if (path[0] != '/') path = '/' + path;
          }
        }
        if (!path) {
          return reject(new Error('Missing mask for ' + url));
        }

        if (happn.assetCache.js[path]) {
          path = path.replace(/\.js$/, '_dupe-path_' + ++i + '.js');
        }

        list.push('/' + happn.name + '/js' + path);
        happn.assetCache.js[path] = {
          get: (source == 'file')
            ? function() {
              return Assets.loadFile(happn, type, seq, url);
            } 
            : function() {
              return Assets.loadWeb(happn, type, seq, url);
            }
        }
      });

      happn.assetCache.js['/'] = {
        get: function() {
          return promise(function(resolve, reject) {
            var rootScript = devscript.generate(list);
            resolve({
              checksum: md5(rootScript),
              data: rootScript
            });
          });
        }
      }
      resolve();
    });
  }
  if (type == 'css') {
    return promise(function(resolve, reject) {
      var rootStyle = '';
      happn.assetRaw.css.forEach(function(parts) {
        var url = parts[2];
        rootStyle += '@import url("'+ url +'");\n';
      });
      happn.assetCache.css['/'] = {
        get: function() {
          return promise(function(resolve, reject) {
            resolve({
              checksum: md5(rootStyle),
              data: rootStyle
            });
          });
        }
      }
      resolve();
    });
  }
  if (type == 'html') {
    return promise(function(resolve, reject) {
      happn.assetCache.html['/'] = {
        get: function() {
          return promise(function(resolve, reject) {
            resolve({
              checksum: '',
              data: ''
            });
          });
        }
      }
      resolve();
    });
  }
}
