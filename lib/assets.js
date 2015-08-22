module.exports = Assets;

/* CANNOT BE SHARED MODULE */
/* CREATE MULTIPLE MODULE INSTANCES IF MULTIPLE COMPONENT INSTANCES ARE NECESSARY */

var debug = require('debug')('happngin-assets');
var promise = require('when').promise;
var parallel = require('when/parallel');
var request = require('request');
var fs = require('fs');
var md5 = require('md5');
var devscript = require('./devscript');
var minify = require('uglify-js').minify;

function Assets() {
  var env = process.env.NODE_ENV;
  var isprd = (env == 'production' || env == 'prd');
  this.env = isprd ? 'production' : 'development';
  this.cache = {
    scripts: {}
  };
  this.raw = {
    scripts: []
  }
  this.queue = [];
  this.loading = false;
  this.ready = false;
}

Assets.prototype.js = function($happn, req, res) {
  if (!this.ready) {
    this.name = $happn.name;
    this.queue.push({type:'js', req:req, res:res});
    debug('js() queue length: %d', this.queue.length);
    return Assets.load($happn.config, this);
  }
  Assets.jsReply(this, req, res);
}

Assets.prototype.css = function(req, res) {

}

Assets.jsReply = function(instance, req, res) {
  if (!instance.cache.scripts[req.url]) {
    res.statusCode = 404;
    return res.end();
  }

  instance.cache.scripts[req.url].get()
  .then(function(script) {

    if (script.checksum) {
      if (req.headers['if-none-match'] == script.checksum) {
        debug('jsReply() from cache for %s', req.url);
        res.statusCode = 304;
        return res.end();
      }
    }

    res.writeHead(200, {
      'Content-Type': 'text/javascript',
      'Cache-Control': "max-age=0",
      'ETag': script.checksum
    });
    debug('jsReply() non cache for %s', req.url);
    res.end(script.data);

  })
  .catch(function(err) {
    console.error(err.stack);
    res.statusCode = 500;
    res.end();
  })
}

Assets.dequeue = function(instance) {
  var waiting;
  while(waiting = instance.queue.shift()) {
    Assets[waiting.type + 'Reply'](instance, waiting.req, waiting.res);
  }
}

Assets.load = function(config, instance) {
  if (instance.loading) {
    debug('load() pending for %d seconds', (Date.now() - instance.startLoad) / 1000 );
    return;
  }
  instance.loading = true;
  instance.startLoad = Date.now();
  instance.masks = config.masks.sort(function(a, b) {
    // longest to shortest
    if (a.length < b.length) return 1;
    if (a.length > b.length) return -1;
    return 0;
  });

  var scripts = config.scripts || [];

  var i = 0
  parallel(scripts.map(function(script) {
    return function() {
      if (script.indexOf('http') == 0)
        return Assets.loadWeb(instance, i++, script);
      return Assets.loadFile(instance, i++, script);
    }
  })).then(
    function() {
      instance.loading = false;
      instance.ready = true;
      Assets.process(instance)
      .then(function() {
        Assets.dequeue(instance);
      })
    },
    function(err) {
      console.log(err.stack);
      process.exit(1);  // BANG! faulty assets, can't function!
    }
  )
}

Assets.loadWeb = function(instance, i, url) {
  return promise(function(resolve, reject) {
    debug('loadWeb() %d %s', i, url)

    var mini;
    var result = function(err, response, body) {
      if (err) return reject(err);
      if (response.statusCode != 200)
        return reject(
          new Error('Non-200 statusCode for ' + url)
        );
      if (instance.env !== 'production') {
        instance.raw.scripts[i] = ['web', i, url];
        return resolve({
          checksum: md5(body), 
          data: body
        });
      }
      instance.raw.scripts[i] = ['web', i, url, md5(body), body];
      resolve();
    }

    if (instance.env == 'production') {
      if (url.match(/\.js$/) && !url.match(/\.min\.js$/)) {
        mini = url.replace(/\.js$/, '.min.js');
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

Assets.loadFile = function(instance, i, file) {
  return promise(function(resolve, reject) {
    debug('loadFile() %d %s', i, file)

    var mini;
    var result = function(err, buf) {
      if (err) return reject(err);
      if (instance.env !== 'production') {
        instance.raw.scripts[i] = ['file', i, file];
        return resolve({
          checksum: md5(buf),
          data: buf.toString()
        });
      }
      instance.raw.scripts[i] = ['file', i, file, md5(buf), buf.toString()];
      resolve(); 
    }

    if (instance.env == 'production') {
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

Assets.process = function(instance) {
  return Assets[instance.env](instance)
}

Assets.production = function(instance) {
  debug('build PRODUCTION assets');
  return promise(function(resolve, reject) {
    var checksum;
    var content = '';

    instance.raw.scripts.forEach(function(parts) {
      var mini;
      var data = parts[4];
      var url = parts[2];

      if (!url.match(/\.min\.js/)) {
        debug('minify %s', url);
        mini = minify(data, {fromString: true});
        content += '\n' + mini.code;
        return;
      }
      content += '\n' + data;
    });

    checksum = md5(content);

    instance.cache.scripts['/'] = {
      get: function() {
        return promise(function(resolve, reject) {
          resolve({
            checksum: checksum,
            data: content
          })
        })
      }
    }
    resolve();
  });
}

Assets.development = function(instance) {
  debug('build DEVELOPMENT assets');
  var masks = instance.masks;
  var list = []; 
  return promise(function(resolve, reject) {
    instance.raw.scripts.forEach(function(parts) {

      var type = parts[0];
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
        return reject(new Error('Missing mask for ' + url))
      }
      path = path.split('/');
      path[path.length - 1] = seq + '-' + path[path.length - 1];
      path = path.join('/');
      list.push('/' + instance.name + '/js' + path);
      instance.cache.scripts[path] = {
        get: (type == 'file') 
          ? function() {
            return Assets.loadFile(instance, seq, url);
          } 
          : function() {
            return Assets.loadWeb(instance, seq, url);
          }
      }
    });

    instance.cache.scripts['/'] = {
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
