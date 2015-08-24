### Usage:

#### In mesh config:

```javascript

bowerDirectory = require('path').normalize(__dirname + '/../bower_components');

  ...
  components: {
    "assets": {
      
      // set masks, used to mask out the
      // leading part of the path/url for
      // all 'js', 'css' and 'html'

      masks: [
        'http://localhost',
        bowerDirectory
      ],

      // set js, used to build a single script package
      // from external sources, local directories or
      // client components of other local mesh modules

      js: [
        'http://localhost/firstMeshComponent/static/client.js',
        'http://localhost/anotherMeshComponent/static/client.js',
        'http://cdn.zz.net/kquery/0.5.6/kquery.js',
        bowerDirectory + '/jquery/dist/jquery.js',
        bowerDirectory + '/bluebird/bluebird.js',
      ],

      // set css, used to build single css package from 
      // multiple sources

      css: [
        'http://localhost/firstMeshComponent/static/client.css',
        'http://localhost/anotherMeshComponent/static/client.css',
      ],

      // set ngApp, for angular templates to be included with the js package

      ngApp: {
        name: 'templateS', // name of angular module to include into app
        templates: [
          'http://localhost/firstMeshComponent/static/client.html',
          'http://localhost/anotherMeshComponent/static/client.html',
        ]
      }
    }
  }
  ...
```

#### In the client:

(/assets/js, /assets/css, /assets/html)

```html
<html>
<head>
    <script src='/assets/js'></script>
    <link rel='stylesheet' type='text/css' href='/assets/css'></link>
</head>
<body ng-app='Demo' ng-view>
</body>
```

```javascript
var app = angular.module('Demo', ['templateS'])
.directive('thing', [function() {
  return {
    templateUrl: '/firstMeshComponent/static/client.html',
                 // is preloaded in production mode
    ...
  }
}]);
```

### Production

```bash
NODE_ENV=production node myMesh.js
```
In production mode the js, css and html are each compiled into single packages (minified and gzipped)

### Development (the default)

In development mode the scripts and css are all downloaded into the browser in their respective original unminified files.

