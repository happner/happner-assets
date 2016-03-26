`npm install happner-assets --save`

Asset packager for [happner](https://github.com/happner/happner)

It packages all specified scripts, styles and angular templates into a single `js` and `css` file and can include resources from the local site and from elsewhere on the internet. Any scripts not included into the package might load/execute out of sequence <b>so include all scripts into the package</b>.

### Caveat

It only builds the package on first request. And there will be a problem if any of the configured resources are not available. For this reason use of only local resources is recommended.

### Todo

Build package on startup.

### Production

```bash
NODE_ENV=production node myMesh.js

optional: DEBUG=happn* ...
```
In production mode the js, css are each compiled into single packages (minified, gzipped and cached in the browser)

### Development (the default)

In development mode the scripts and css are all downloaded into the browser as their respective original unminified files.


### Usage:

#### In mesh config:

```javascript

var bowerDirectory = require('path').normalize(__dirname + '/../bower_components');

  ...
  components: {
    'assets': { // defaults to require module 'happner-assets'
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

__NOTE:__ All scripts where load order matters should be in the package. Additional scripts called from the page will load out of order.

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
