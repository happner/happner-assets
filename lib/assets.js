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
  // load scripts just-in-time (allows for proxiing of other module scripts)
  // until theres a ready event from the mesh
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
  res.end(instance.cache.scripts[req.url].data);
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
      process.exit(1);
    }
  )
}

Assets.loadWeb = function(instance, i, url) {
  return promise(function(resolve, reject) {
    debug('loadWeb() %d %s', i, url)
    request(url, function(err, response, body) {
      if (err) return reject(err);
      if (response.statusCode != 200)
        return reject(
          new Error('Non-200 statusCode for ' + url)
        );
      instance.raw.scripts[i] = ['web', i, url, md5(body), body];
      resolve();
    });
  });
}

Assets.loadFile = function(instance, i, file) {
  return promise(function(resolve, reject) {
    debug('loadFile() %d %s', i, file)
    fs.readFile(file, function(err, buf) {
      if (err) return reject(err);
      instance.raw.scripts[i] = ['file', i, file, md5(buf), buf.toString()];
      resolve();
    });
  });
}

Assets.process = function(instance) {
  return Assets[instance.env](instance)
}

Assets.production = function(instance) {
  debug('build PRODUCTION assets');
  return promise(function(resolve, reject) {
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
      var checksum = parts[3];
      var data = parts[4];
      if (type == 'file') {
        for (var i = 0; i < masks.length; i++) {
          if (url.indexOf(masks[i]) == 0) {
            url = url.replace(masks[i], '');
            if (url[0] != '/') url = '/' + url;
          }
        }
        url = url.split('/');
        url[url.length - 1] = seq + '-' + url[url.length - 1];
        url = url.join('/');
        list.push('/' + instance.name + '/js' + url);
      } else {
        list.push(url);
      }
      if (type != 'file') return;
      instance.cache.scripts[url] = {
        checksum: checksum,
        data: data
      }
    });

    instance.cache.scripts['/'] = {
      data: devscript.generate(list)
    }
    resolve();
  });
}
