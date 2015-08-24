`npm install happngin-assets --save`

### Usage:

#### In mesh config:

```javascript

bowerDirectory = require('path').normalize(__dirname + '/../bower_components');

  ...
  components: {
    "assets": { // defaults to require module 'happngin-assets'
      masks: [
        'http://localhost',
        bowerDirectory
      ],
      js: [
        'http://localhost/firstMeshComponent/static/client.js',
        'http://localhost/anotherMeshComponent/static/client.js',
        'http://cdn.zz.net/kquery/0.5.6/kquery.js',
        bowerDirectory + '/jquery/dist/jquery.js',
        bowerDirectory + '/bluebird/bluebird.js',
      ],
      css: [
        'http://localhost/firstMeshComponent/static/client.css',
        'http://localhost/anotherMeshComponent/static/client.css',
      ],
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

(/assets/js, /assets/css)

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
                 // is preloaded in production mode via /assets/js package
    ...
  }
}]);
```

### Production

```bash
NODE_ENV=production node myMesh.js
```
In production mode the js, css are each compiled into single packages (minified, gzipped and cached in the browser)

### Development (the default)

In development mode the scripts and css are all downloaded into the browser in their respective original unminified files.

