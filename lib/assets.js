module.exports = Assets;

var debug = require('debug')('happner-assets');
var promise = require('when').promise;
var parallel = require('when/parallel');
var sequence = require('when/sequence');
var request = require('request');
var fs = require('fs');
var md5 = require('md5');
var dev = require('./dev');
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

Assets.prototype.$happner = {
  config: {
    component: {
      schema: {
        exclusive: true
      },
      web: {
        routes: {
          js: 'js',
          css: 'css',
        }
      }
    }
  }
}

Assets.reply = function(happn, type, req, res) {
  var url = req.url;

  debug('reply() %s %s', type, url);
  if (!happn.assetCache[type][url]) {
    res.statusCode = 404;
    debug('reply() %s missing for %s', type, url);
    return res.end();
  }

  happn.assetCache[type][url].get()
  .then(function(script) {

    if (script.checksum) {
      if (req.headers['if-none-match'] == script.checksum) {
        debug('reply() %s from cache for %s', type, url);
        res.statusCode = 304;
        return res.end();
      }
    }

    var header = {
      'Content-Type': script.contentType,
      'Cache-Control': "max-age=0",
      'ETag': script.checksum
    }

    if (script.gzip) {
      header['Content-Encoding'] = 'gzip';
    }

    res.writeHead(200, header);
    debug('jsReply() %s non cache for %s', type, url);
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
    ngApp: {},
  };
  happn.assetRaw = {
    js: [],
    css: [],
    ngApp: [],
  }

  happn.assetLoading = true;
  happn.assetLoadingStart = Date.now();
  happn.config.masks = happn.config.masks.sort(function(a, b) {
    // longest to shortest
    if (a.length < b.length) return 1;
    if (a.length > b.length) return -1;
    return 0;
  });

  parallel(['js', 'css', 'ngApp'].map(function(type){
    return function() {
      var i = 0
      var list = happn.config[type] || [];
      if (type == 'ngApp') list = list.templates || [];
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

    if (url.match(/\/\/localhost\//)) {
      var local = happn.info.datalayer.address.address + ':' + happn.info.datalayer.address.port;
      url = url.replace(/\/\/localhost\//, '//' + local + '/');
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
        happn.assetRaw[type][i] = ['file', i, file];
        return resolve({
          checksum: md5(buf),
          data: buf.toString(),
          contentType: type == 'js' ? 'text/javascript' : 'text/' + type
        });
      }
      happn.assetRaw[type][i] = ['file', i, file, md5(buf), buf.toString()];
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
  return sequence(['ngApp', 'js', 'css'].map(
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

    if (type == 'ngApp') {
      if (!happn.config.ngApp) return resolve();
      content = 'var myApp = angular.module(\''+ happn.config.ngApp.name +'\', []);';
      content += 'myApp.run([\'$templateCache\', function($templateCache) {';
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
        debug('minify %s %s', type, url);
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
      if (type == 'ngApp') {
        data = minifyHTML(data, {
          removeComments: true,
          collapseWhitespace: true
        });
        content += '$templateCache.put(\''+ path +'\', \''+ data.replace(/'/g, "\\'") +'\');'
        // content += 'script=document.createElement(\'script\');';
        // content += 'script.id=\''+ path +'\';'
        // content += 'script.type=\'text/ng-template\';'
        // content += 'script.text = \''+  data.replace(/'/g, "\\'") + '\';';
        // content += 'body.appendChild(script);'

      } else {
        content += '\n' + data;
      }
    });

    if (type == 'ngApp') {
      content += '}]);';
      happn.assetRaw['js'].push([null, null, masks[0] + '/', null, content]);
      return resolve();
    }

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
              contentType: type == 'js' ? 'text/javascript' : 'text/' + type
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
  var match;
  return promise(function(resolve, reject) {
    happn.assetRaw[type].forEach(function(parts) {

      var source = parts[0];
      var seq = parts[1];
      var url = parts[2];
      var path = url;

      if (url.indexOf('http') != 0) {
        for (var i = 0; i < masks.length; i++) {
          if (url.indexOf(masks[i]) == 0) {
            path = url.replace(masks[i], '');
            if (path[0] != '/') path = '/' + path;
          }
        }
        if (!path) {
          return reject(new Error('Missing mask for ' + url));
        }
        if (happn.assetCache[type][path]) {
          match = new RegExp('\\.'+type+'$')
          path = path.replace(match, '_dupe-path_' + ++i + '.' + type);
        }
        list.push('/' + happn.name + '/' + type + path);
      } else {
        list.push(path);
      }


      happn.assetCache[type][path] = {
        get: (source == 'file')
          ? function() {
            return Assets.loadFile(happn, type, seq, url);
          }
          : function() {
            return Assets.loadWeb(happn, type, seq, url);
          }
      }
    });

    if (type == 'js' && happn.config.ngApp) {
      var path = '/__' + happn.config.ngApp.name;
      var data = 'angular.module(\''+ happn.config.ngApp.name +'\',[]);';
      var checksum = md5(data);
      list.push('/' + happn.name + '/' + type + path);
      happn.assetCache[type][path] = {
        get: function() {
          return promise(function(resolve, reject) {
            resolve({
              data: data,
              checksum: checksum,
              contentType: 'text/javascript'
            });
          });
        }
      }
    }

    happn.assetCache[type]['/'] = {
      get: function() {
        return promise(function(resolve, reject) {
          var rootScript = dev.generate[type](list);
          resolve({
            checksum: md5(rootScript),
            data: rootScript,
            contentType: type == 'js' ? 'text/javascript' : 'text/' + type
          });
        });
      }
    }
    resolve();
  });
}
