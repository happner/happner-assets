var downloader = function(scriptList) {
  var recurse = function(scriptList) {
    var url = scriptList.shift();
    if (!url) return;
    var script=document.createElement('script');
    script.src=url;
    var head=document.getElementsByTagName('head')[0];
    var done=false;
    script.onload = script.onreadystatechange = function() {
      if (!done && (!this.readyState || this.readyState == 'loaded' || this.readyState == 'complete') ) {
        done=true;
        recurse(scriptList);
        script.onload = script.onreadystatechange = null;
        head.removeChild(script);
      }
    };
    head.appendChild(script);
  }
  recurse(scriptList);
}

module.exports.generate = {
  js: function(scriptList) {
    return '(' + downloader.toString() + ')(' + JSON.stringify(scriptList) + ')';
  },
  css: function(scriptList) {
    var script = '';
    return scriptList.map(function(url){
      return '@import url("'+ url +'");\n';
    }).join('');
  },
  // html: function() {
  //   return '"noop"';
  // }
};
