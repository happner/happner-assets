`npm install happngin-assets`

### Usage:

In mesh config:

```javascript

bowerDirectory = require('path').normalize(__dirname + '/../bower_components');

  ...
  components: {
    "assets": {
      
      // pending defaultations, this is necessary each time. 
      schema: {
        exclusive: true
      },
      web: {
        routes: {
          js: 'js',
          css: 'css',
          html: 'html'
        }
      },



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

      // set css, used build single css package from 
      // multiple sources

      css: [
        'http://localhost/firstMeshComponent/static/client.css',
        'http://localhost/anotherMeshComponent/static/client.css',
      ],

      // set html, (for angular templates) assembles a single package

      html: [
        'http://localhost/firstMeshComponent/static/client.html',
        'http://localhost/anotherMeshComponent/static/client.html',
      ]
    }
  }
  ...
```


