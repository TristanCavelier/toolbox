/*jslint indent: 2 */
(function script(exportRoot, exportKey) {
  "use strict";

  /*! Copyright (c) 2015 Tristan Cavelier <t.cavelier@free.fr>
      This program is free software. It comes without any warranty, to
      the extent permitted by applicable law. You can redistribute it
      and/or modify it under the terms of the Do What The Fuck You Want
      To Public License, Version 2, as published by Sam Hocevar. See
      http://www.wtfpl.net/ for more details. */

  /*jslint indent: 2, nomen: true */

  var env = {};

  if (typeof exportKey !== "string") { exportKey = "env"; }
  if (typeof exportRoot === "object" && exportRoot !== null) { exportRoot[exportKey] = env; }

  env.toScript = function () { return "/*jslint indent: 2 */\n(" + script.toString() + "(this));\n"; };
  env.newEnv = function () { return script(); };
  env.this = env;

  //////////////////////////////////////////////////////////////////////

  ////////////
  // Native //
  ////////////

  (function () {
    /*global setTimeout, clearTimeout, Promise */
    env.setTimeout = typeof setTimeout === "function" ? setTimeout.bind(null) : null;
    env.clearTimeout = typeof clearTimeout === "function" ? clearTimeout.bind(null) : null;
    env.Promise = typeof Promise === "function" ? Promise : null;
  }());

  function newPromise(executor) {
    return new env.Promise(executor);
  }
  env.newPromise = newPromise;

  //////////////
  // Polyfill //
  //////////////

  if (typeof env.Promise === "function") {
    env.setImmediate = function (fn) {
      env.Promise.resolve().then(fn.apply.bind(fn, null, [].slice(arguments, 1)));
    };
  } else {
    env.setImmediate = function (fn) {
      // XXX find something else like mutation observer
      env.setTimeout(fn.apply.bind(fn, null, [].slice(arguments, 1)));
    };
  }

  env.PromisePolyfill = (function () {

    // XXX function setImmediate() {}

    function handleListener(previous, next, listener, offset) {
      /*global resolvePromise */
      var value;
      if (typeof listener !== "function") {
        return resolvePromise(next, previous["[[PromiseValue]]"], offset);
      }
      try {
        value = listener(previous["[[PromiseValue]]"]);
        if (value && typeof value.then === "function") {
          value.then(function (value) {
            resolvePromise(next, value, 1);
          }, function (reason) {
            resolvePromise(next, reason, 2);
          });
        } else {
          resolvePromise(next, value, 1);
        }
      } catch (reason) {
        resolvePromise(next, reason, 2);
      }
    }

    function forceResolvePromise(promise, value, offset) {
      if (value && typeof value.then === "function") {
        promise["[[PromiseStatus]]"] = "waiting";
        return value.then(function (value) {
          forceResolvePromise(promise, value, 1);
        }, function (reason) {
          forceResolvePromise(promise, reason, 2);
        });
      }
      promise["[[PromiseValue]]"] = value;
      promise["[[PromiseStatus]]"] = offset === 1 ? "resolved" : "rejected";
      var i, a = promise["[[PromiseStack]]"], l = a.length;
      delete promise["[[PromiseStack]]"];
      for (i = 0; i < l; i += 3) {
        setTimeout(handleListener, 0, promise, a[i], a[i + offset], offset);
      }
    }

    function resolvePromise(promise, value, offset) {
      if (promise["[[PromiseStatus]]"] !== "pending") { return; }
      forceResolvePromise(promise, value, offset);
    }

    function PromisePolyfill(executor) {
      if (!(this instanceof PromisePolyfill)) {
        throw new TypeError(this + " is not a promise");
      }
      if (typeof executor !== "function") {
        throw new TypeError("Promise resolver " + executor + " is not a function");
      }
      this["[[PromiseStack]]"] = [];
      var it = this;
      function resolve(value) { resolvePromise(it, value, 1); }
      function reject(reason) { resolvePromise(it, reason, 2); }
      try {
        executor(resolve, reject);
      } catch (reason) {
        resolvePromise(this, reason, 2);
      }
    }
    PromisePolyfill.prototype["[[PromiseValue]]"] = null;
    PromisePolyfill.prototype["[[PromiseStatus]]"] = "pending";
    PromisePolyfill.prototype.then = function (onDone, onFail) {
      var next = new PromisePolyfill(function () { return; });
      if (this["[[PromiseStatus]]"] === "resolved") {
        setTimeout(handleListener, 0, this, next, onDone, 1);
      } else if (this["[[PromiseStatus]]"] === "rejected") {
        setTimeout(handleListener, 0, this, next, onFail, 2);
      } else {
        this["[[PromiseStack]]"].push(next, onDone, onFail);
      }
      return next;
    };
    PromisePolyfill.prototype.catch = function (onFail) {
      return this.then(null, onFail);
    };
    PromisePolyfill.resolve = function (value) {
      return new PromisePolyfill(function (resolve) {
        resolve(value);
      });
    };
    PromisePolyfill.reject = function (reason) {
      return new PromisePolyfill(function (resolve, reject) {
        /*jslint unparam: true */
        reject(reason);
      });
    };
    PromisePolyfill.all = function (iterable) {
      return new PromisePolyfill(function (resolve, reject) {
        var i, l = iterable.length, results = [], count = 0;
        function resolver(i) {
          return function (value) {
            results[i] = value;
            count += 1;
            if (count === l) { resolve(results); }
          };
        }
        for (i = 0; i < l; i += 1) {
          PromisePolyfill.resolve(iterable[i]).then(resolver(i), reject);
        }
      });
    };
    PromisePolyfill.race = function (iterable) {
      return new PromisePolyfill(function (resolve, reject) {
        var i, l = iterable.length;
        for (i = 0; i < l; i += 1) {
          PromisePolyfill.resolve(iterable[i]).then(resolve, reject);
        }
      });
    };

    return PromisePolyfill;
  }());

  function newPromisePolyfill(executor) {
    return new env.PromisePolyfill(executor);
  }
  env.newPromisePolyfill = newPromisePolyfill;

  if (env.Promise === undefined) {
    env.Promise = env.PromisePolyfill;
  }

  //////////////////////////
  // Promise Manipulation //
  //////////////////////////

  function newDeferred() {
    var it = {};
    it.promise = env.newPromise(function (resolve, reject) {
      it.resolve = resolve;
      it.reject = reject;
    });
    return it;
  }
  env.newDeferred = newDeferred;

  function newCancellableDeferred() {
    // Simple example:
    //   var cd = env.newCancellableDeferred()
    //   cd.oncancel = function () { cd.reject("CANCELLED"); };
    //   ...do asynchronous code here...
    //   return cd.promise;

    var it = {};
    it.promise = env.newPromise(function (resolve, reject) {
      it.resolve = resolve;
      it.reject = reject;
    });
    it.promise.cancel = function () {
      try { it.oncancel(); } catch (ignore) {}
      return this;
    };
    return it;
  }
  env.newCancellableDeferred = newCancellableDeferred;

  //////////////////////
  // DOM Manipulation //
  //////////////////////

  function textToHTMLElements(text) {
    /*global document */
    var div = document.createElement("div");
    div.innerHTML = text;
    return div.querySelectorAll("*");
  }
  env.textToHTMLElements = textToHTMLElements;

  //////////
  // HTTP //
  //////////

  function textToHTTPHeadersObject(text) {
    // text ->
    //  "Server:   SimpleHTTP/0.6 Python/3.4.1\r\n
    //   Date: Wed, 04 Jun 2014 14:06:57 GMT   \r\n
    //   Value: hello\r\n     guys  \r\n
    //   Content-Type: application/x-silverlight\r\n
    //   Content-Length: 11240\r\n
    //   Last-Modified: Mon, 03 Dec 2012 23:51:07 GMT\r\n
    //   X-Cache: HIT via me\r\n
    //   X-Cache: HIT via other\r\n"
    // Returns ->
    //   { "Server": "SimpleHTTP/0.6 Python/3.4.1",
    //     "Date": "Wed, 04 Jun 2014 14:06:57 GMT",
    //     "Value": "hello guys",
    //     "Content-Type": "application/x-silverlight",
    //     "Content-Length": "11240",
    //     "Last-Modified": "Mon, 03 Dec 2012 23:51:07 GMT",
    //     "X-Cache": "HIT via me, HIT via other" }

    /*jslint regexp: true */
    var result = {}, key, value = "";
    text.split("\r\n").forEach(function (line) {
      if (line[0] === " " || line[0] === "\t") {
        value += " " + line.replace(/^\s*/, "").replace(/\s*$/, "");
      } else {
        if (key) {
          if (result[key]) {
            result[key] += ", " + value;
          } else {
            result[key] = value;
          }
        }
        key = /^([^:]+)\s*:\s*(.*)$/.exec(line);
        if (key) {
          value = key[2].replace(/\s*$/, "");
          key = key[1];
        }
      }
    });
    return result;
  }
  env.textToHTTPHeadersObject = textToHTTPHeadersObject;

  function newXMLHttpRequestPromise(param) {
    /**
     *    newXMLHttpRequestPromise({url: location, responseType: "text"}).then(propertyGetter("data"));
     *    newXMLHttpRequestPromise({url: location}).then(propertyGetter("Content-Length"));
     *
     * Send request with XHR and return a promise. xhr.onload: The promise is
     * resolved when the status code is lower than 400 with a forged response
     * object as resolved value. xhr.onerror: reject with an Error (with status
     * code in status property) as rejected value.
     *
     * @param  {Object} param The parameters
     * @param  {String} param.url The url
     * @param  {String} [param.method="GET"] The request method
     * @param  {String} [param.responseType=""] The data type to retrieve
     * @param  {String} [param.overrideMimeType] The mime type to override
     * @param  {Object} [param.headers] The headers to send
     * @param  {Any} [param.data] The data to send
     * @param  {Boolean} [param.withCredentials] Tell the browser to use
     *   credentials
     * @param  {Object} [param.xhrFields] The other xhr fields to fill
     * @param  {Boolean} [param.getEvent] Tell the method to return the
     *   response event.
     * @param  {Function} [param.beforeSend] A function called just before the
     *   send request. The first parameter of this function is the XHR object.
     * @return {CancellablePromise<Object>} Response object is like { data: .., header1: ..,
     *   header2: .., ... }
     */

    /*global XMLHttpRequest */
    var d = env.newCancellableDeferred(), xhr = new XMLHttpRequest(), k;
    d.oncancel = function () { xhr.abort(); };
    xhr.open((param.method || "GET").toUpperCase(), param.url, true);
    xhr.responseType = param.responseType || "";
    if (param.overrideMimeType) {
      xhr.overrideMimeType(param.overrideMimeType);
    }
    if (param.withCredentials !== undefined) {
      xhr.withCredentials = param.withCredentials;
    }
    if (param.headers) {
      for (k in param.headers) {
        if (param.headers.hasOwnProperty(k)) {
          xhr.setRequestHeader(k, param.headers[k]);
        }
      }
    }
    xhr.addEventListener("load", function (e) {
      if (param.getEvent) { return d.resolve(e); }
      var r, t = e.target, callback;
      if (t.status < 400) {
        r = {};
        callback = d.resolve;
      } else {
        r = new Error("XMLHttpRequest: " + (t.statusText || "unknown error"));
        callback = d.reject;
      }
      r.response = t.response;
      r.responseText = t.responseText;
      r.responseType = t.responseType;
      r.responseURL = t.responseURL;
      r.responseXML = t.responseXML;
      r.status = t.status || 0;
      r.statusText = t.statusText || "Unknown";
      r.timeout = t.timeout;
      r.withCredentials = t.withCredentials;
      r.headersText = t.getAllResponseHeaders();
      r.headers = env.textToHTTPHeadersObject(r.headersText);
      callback(r);
    }, false);
    xhr.addEventListener("error", function (e) {
      if (param.getEvent) { return d.resolve(e); }
      return d.reject(new Error("request error"));
    }, false);
    xhr.addEventListener("abort", function (e) {
      if (param.getEvent) { return d.resolve(e); }
      return d.reject(new Error("request aborted"));
    }, false);
    if (param.xhrFields) {
      for (k in param.xhrFields) {
        if (param.xhrFields.hasOwnProperty(k)) {
          xhr[k] = param.xhrFields[k];
        }
      }
    }
    if (typeof param.beforeSend === 'function') {
      param.beforeSend(xhr);
    }
    xhr.send(param.data);
    return d.promise;
  }
  env.newXMLHttpRequestPromise = newXMLHttpRequestPromise;

  ////////////////////
  // Worker helpers //
  ////////////////////

  function evalOnWorkerPromise(value) {
    /*global Worker, URL, Blob */
    // XXX how to avoid "Uncaught (in promise) error..." ?
    var worker = new Worker(URL.createObjectURL(new Blob([[
      "var global = this;",
      "onmessage = function(e) {",
      "  Promise.resolve().then(function () {",
      "    return global.eval(e.data);",
      "  }).then(function (value) {",
      "    postMessage([value]);",
      "  }, function (reason) {",
      "    if (reason instanceof Error) { reason = reason.toString(); }",
      "    postMessage([undefined, reason]);",
      "  });",
      "}"
    ].join("\n")], {type: "application/javascript"}))), d = env.newCancellableDeferred();
    d.oncancel = function () {
      worker.terminate();
      d.reject(new Error("evalOnWorkerPromise cancelled"));
    };
    worker.onmessage = function (e) {
      if (e.data.length > 1) { d.reject(e.data[1]); } else { d.resolve(e.data[0]); }
      worker.terminate();
    };
    worker.postMessage(value);
    return d.promise;
  }
  env.evalOnWorkerPromise = evalOnWorkerPromise;

  /////////////////////////
  // Object Manipulation //
  /////////////////////////

  function copyObjectProperties(dst, src) {
    /*jslint forin: true */
    var k;
    for (k in src) {
      dst[k] = src[k];
    }
    return dst;
  }
  env.copyObjectProperties = copyObjectProperties;

  function copyObjectOwnProperties(dst, src) {
    var k;
    for (k in src) {
      if (src.hasOwnProperty(k)) {
        dst[k] = src[k];
      }
    }
    return dst;
  }
  env.copyObjectOwnProperties = copyObjectOwnProperties;

  function setDefaultObjectProperties(dst, src) {
    /*jslint forin: true */
    var k;
    for (k in src) {
      if (dst[k] === undefined) {
        dst[k] = src[k];
      }
    }
    return dst;
  }
  env.setDefaultObjectProperties = setDefaultObjectProperties;

  //////////////////////////////////////////////////////////////////////

  return env;
}(this));
