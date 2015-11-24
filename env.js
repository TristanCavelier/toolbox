/*jslint indent: 2 */
(function script(exportRoot, exportKey) {
  "use strict";

  /*! Copyright (c) 2015 Tristan Cavelier <t.cavelier@free.fr>
      This program is free software. It comes without any warranty, to
      the extent permitted by applicable law. You can redistribute it
      and/or modify it under the terms of the Do What The Fuck You Want
      To Public License, Version 2, as published by Sam Hocevar. See
      http://www.wtfpl.net/ for more details. */

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
    /*global setTimeout, clearTimeout, Promise,
             btoa, atob */
    env.setTimeout = typeof setTimeout === "function" ? setTimeout.bind(null) : null;
    env.clearTimeout = typeof clearTimeout === "function" ? clearTimeout.bind(null) : null;
    env.Promise = typeof Promise === "function" ? Promise : null;
    env.encodeBinaryStringToBase64 = typeof btoa === "function" ? btoa.bind(null) : null;
    env.decodeBase64ToBinaryString = typeof atob === "function" ? atob.bind(null) : null;
  }());

  env.newPromise = function (executor) { return new env.Promise(executor); };

  //////////////
  // Polyfill //
  //////////////

  env.newSetImmediateFunctionBasedOnSeveralSetTimeouts = function (maxTimers) {
    var queue = [], count = 0;
    if (maxTimers === undefined) { maxTimers = 6; }
    function exec() {
      count--;
      if (queue.length) { queue.shift()(); }
    }
    function setImmediate(fn) {
      var l = arguments.length - 1, a = new Array(l), i = 0;
      while (i < l) { a[i] = arguments[++i]; }
      queue.push(fn.apply.bind(fn, null, a));
      while (++count < maxTimers) { setTimeout(exec); }
      setTimeout(exec);
    }
    return setImmediate;
  };

  if (typeof env.Promise === "function") {
    env.setImmediate = function (fn) {
      /*jslint plusplus: true */
      var l = arguments.length - 1, i = 0, args = new Array(l);
      while (i < l) { args[i] = arguments[++i]; }
      env.Promise.resolve().then(fn.apply.bind(fn, null, args));
    };
  } else {
    env.setImmediate = env.newSetImmediateFunctionBasedOnSeveralSetTimeouts();
  }

  env.PromisePolyfill = (function () {

    var queue = [], count = 0, maxTimers = 6;
    function exec() {
      count--;
      if (queue.length) { queue.shift()(); }
    }
    function setImmediate(fn) {
      var l = arguments.length - 1, a = new Array(l), i = 0;
      while (i < l) { a[i] = arguments[++i]; }
      queue.push(fn.apply.bind(fn, null, a));
      while (++count < maxTimers) { setTimeout(exec); }
      setTimeout(exec);
    }

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
        setImmediate(handleListener, 0, promise, a[i], a[i + offset], offset);
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
        setImmediate(handleListener, 0, this, next, onDone, 1);
      } else if (this["[[PromiseStatus]]"] === "rejected") {
        setImmediate(handleListener, 0, this, next, onFail, 2);
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

  env.newPromisePolyfill = function () { var c = env.PromisePolyfill, o = Object.create(c.prototype); c.apply(o, arguments); return o; };
  if (env.Promise === null) { env.Promise = env.PromisePolyfill; }

  //////////////////////////
  // Promise Manipulation //
  //////////////////////////

  function Deferred() {
    var it = this;
    this.promise = env.newPromise(function (resolve, reject) {
      it.resolve = resolve;
      it.reject = reject;
    });
  }
  env.Deferred = Deferred;
  env.newDeferred = function () { var c = env.Deferred, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  function Task(generator) {
    var it = this;
    this["[[TaskPromise]]"] = env.newPromise(function (resolve, reject) {
      var g = generator();
      function rec(method, prev) {
        delete it["[[TaskSubPromise]]"];
        if (it["[[TaskCancelled]]"]) { return reject(new Error("Cancelled")); }
        if (it["[[TaskPaused]]"]) {
          it["[[TaskPaused]]"] = function () { rec(method, prev); };
          return;
        }
        var next;
        try { next = g[method](prev); } catch (e) { return reject(e); }
        if (next.done) { return resolve(next.value); }
        it["[[TaskSubPromise]]"] = next = next.value;
        if (!next || typeof next.then !== "function") {
          it["[[TaskSubPromise]]"] = next = env.Promise.resolve(next);
        }
        if (it["[[TaskCancelled]]"]) { try { next.cancel(); } catch (ignore) {} }
        if (it["[[TaskPaused]]"]) { try { next.pause(); } catch (ignore) {} }
        return next.then(function (value) {
          rec("next", value);
        }, function (reason) {
          rec("throw", reason);
        });
      }
      rec("next");
    });
  }
  Task.prototype["[[TaskCancelled]]"] = false;
  Task.prototype["[[TaskPaused]]"] = null;
  Task.prototype.cancel = function () {
    this["[[TaskCancelled]]"] = true;
    try { this["[[TaskSubPromise]]"].cancel(); } catch (ignore) {}
    return this;
  };
  Task.prototype.pause = function () {
    if (this["[[TaskPaused]]"]) { return; }
    this["[[TaskPaused]]"] = true;
    try { this["[[TaskSubPromise]]"].pause(); } catch (ignore) {}
    return this;
  };
  Task.prototype.resume = function () {
    var paused = this["[[TaskPaused]]"];
    if (paused) {
      env.Promise.resolve().then(paused).catch(function () { return; });
      delete this["[[TaskPaused]]"];
      try { this["[[TaskSubPromise]]"].resume(); } catch (ignore) {}
    }
    return this;
  };
  Task.prototype.then = function () {
    var p = this["[[TaskPromise]]"];
    return p.then.apply(p, arguments);
  };
  Task.prototype.catch = function () {
    var p = this["[[TaskPromise]]"];
    return p.catch.apply(p, arguments);
  };
  env.Task = Task;
  env.spawn = env.newTask = function () { var c = env.Task, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  function TaskSequence(queue) {
    var it = this;
    this["[[TaskPromise]]"] = env.newPromise(function (resolve, reject) {
      var i = 0;
      function rec(method, prev) {
        delete it["[[TaskSubPromise]]"];
        if (it["[[TaskCancelled]]"]) { return reject(new Error("Cancelled")); }
        if (it["[[TaskPaused]]"]) {
          it["[[TaskPaused]]"] = function () { rec(method, prev); };
          return;
        }
        var next, callback, l = queue.length;
        if (method) {
          while (!callback) {
            if (i >= l) { return reject(prev); }
            if (queue[i] && typeof queue[i][1] === "function") { callback = queue[i][1]; }
            i += 1;
          }
        } else {
          while (!callback) {
            if (i >= l) { return resolve(prev); }
            if (typeof queue[i] === "function") {
              callback = queue[i];
            } else if (queue[i] && typeof queue[i][0] === "function") {
              callback = queue[i][0];
            }
            i += 1;
          }
        }
        try {
          method = "resolve";
          next = callback(prev);
        } catch (e) {
          method = "reject";
          next = e;
        }
        it["[[TaskSubPromise]]"] = next;
        if (!next || typeof next.then !== "function") {
          it["[[TaskSubPromise]]"] = next = env.Promise[method](next);
        }
        if (it["[[TaskCancelled]]"]) { try { next.cancel(); } catch (ignore) {} }
        if (it["[[TaskPaused]]"]) { try { next.pause(); } catch (ignore) {} }
        return next.then(function (value) {
          rec("", value);
        }, function (reason) {
          rec("r", reason);
        });
      }
      rec("");
    });
  }
  TaskSequence.prototype = Object.create(Task.prototype);
  env.TaskSequence = TaskSequence;
  env.seq = env.newTaskSequence = function () { var c = env.TaskSequence, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  ////////////
  // Random //
  ////////////

  function generateUuid() {
    /**
     * An Universal Unique ID generator
     *
     * @return {String} The new UUID.
     */
    function s4() {
      return ("0000" + Math.floor(
        Math.random() * 0x10000
      ).toString(16)).slice(-4);
    }
    function s8() {
      return ("00000000" + Math.floor(
        Math.random() * 0x100000000
      ).toString(16)).slice(-8);
    }
    return s8() + "-" +
      s4() + "-" +
      s4() + "-" +
      s4() + "-" +
      s8() + s4();
  }
  env.generateUuid = generateUuid;

  //////////////////////
  // DOM Manipulation //
  //////////////////////

  function parseHtmlElements(text) {
    // Usage:
    //   var elements = parseHtmlElements("<a>b</a><c>d<e>f</e></c><g>h</g>");
    //   elements[0] // -> <a>
    //   elements[1] // -> <c>
    //   elements[2] // -> <e>
    //   elements[3] // -> <g>
    // Inject children in an element
    //   [].forEach.call(elements, function (element) {
    //     if (element.parentNode.parentNode) { return; }
    //     root.appendChild(element);
    //   });

    /*global document */
    var div = document.createElement("div");
    div.innerHTML = text;
    return div.querySelectorAll("*");
  }
  env.parseHtmlElements = parseHtmlElements;

  function fitTextareaToTextHeightListener(event) {
    // var textarea = document.querySelector("textarea");
    // textarea.addEventListener("keydown", env.asyncFitTextareaToTextHeightListener, false);
    // env.fitTextareaToTextHeightListener({target: textarea});
    var layout = document.createElement("div"), textarea = event.target;
    layout.style.display = "inline-block";
    layout.style.boxSizing = "border-box";
    layout.style.width = "1px";
    layout.style.height = (textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight) + "px";
    textarea.parentNode.insertBefore(layout, textarea);
    textarea.style.height = "1em";
    textarea.style.height = (textarea.scrollHeight + textarea.offsetHeight - textarea.clientHeight) + "px";
    layout.remove();
  }
  env.fitTextareaToTextHeightListener = fitTextareaToTextHeightListener;
  function asyncFitTextareaToTextHeightListener(event) { env.setTimeout(fitTextareaToTextHeightListener, 0, event); }
  env.asyncFitTextareaToTextHeightListener = asyncFitTextareaToTextHeightListener;

  function findLinksFromDom(dom) {
    // [ { "url": string,  // raw url as written in the html
    //     "attributeName": string,  // the attribute where the url was found (optional)
    //     "element": HTMLElement}, ...]

    var result = [], i, j, el, attr, tmp, row,
      elements = dom.querySelectorAll("*"),
      attributes = ["href", "src"],
      attributesLength = attributes.length,
      elementsLength = elements.length;
    for (i = 0; i < elementsLength; i += 1) {
      el = elements[i];
      for (j = 0; j < attributesLength; j += 1) {
        attr = attributes[j];
        tmp = el.getAttribute(attr);
        if (tmp) {
          row = {
            element: el,
            url: tmp,
            attributeName: attr
          };
          result.push(row);
        }
      }
      if (el.tagName === "HTML") {
        tmp = el.getAttribute("manifest");
        if (tmp) {
          result.push({
            element: el,
            url: tmp,
            attributeName: "manifest"
          });
        }
      }
    }
    return result;
  }
  env.findLinksFromDom = findLinksFromDom;

  function parseHtml(html) {
    /*global DOMParser */
    return new DOMParser().parseFromString(html, "text/html");
  }
  env.parseHtml = parseHtml;

  //////////
  // HTTP //
  //////////

  function parseHttpHeaders(text) {
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
    //   [ ["Server", "SimpleHTTP/0.6 Python/3.4.1"],
    //     ["Date", "Wed, 04 Jun 2014 14:06:57 GMT"],
    //     ["Value", "hello guys"],  // XXX check if it is the good behavior (refer to `xhr.getResponseHeader("Value")`)
    //     ["Content-Type", "application/x-silverlight"],
    //     ["Content-Length", "11240"],
    //     ["Last-Modified", "Mon, 03 Dec 2012 23:51:07 GMT"],
    //     ["X-Cache", "HIT via me"],
    //     ["X-Cache", "HIT via other"] ]

    /*jslint regexp: true */
    var result = [], key, value = "", line, split = text.split("\r\n"), i = 0, l = split.length;
    while (i < l) {
      line = split[i];
      i += 1;
      if (line[0] === " " || line[0] === "\t") {
        value += " " + line.replace(/^\s*/, "").replace(/\s*$/, "");
      } else {
        if (key) { result.push([key, value]); }
        key = /^([^:]+)\s*:\s*(.*)$/.exec(line);
        if (key) {
          value = key[2].replace(/\s*$/, "");
          key = key[1];
        }
      }
    }
    return result;
  }
  env.parseHttpHeaders = parseHttpHeaders;

  function newXmlHttpRequestTask(param) {
    /**
     *    newXmlHttpRequestTask({url: location, responseType: "text"}).then(propertyGetter("response"));
     *    newXmlHttpRequestTask({url: location}).then(propertyGetter("headers", "Content-Length"));
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
     * @param  {String} [param.username] The login username
     * @param  {String} [param.password] The login password
     * @param  {Object} [param.xhrFields] The other xhr fields to fill
     * @param  {Boolean} [param.getEvent] Tell the method to return the
     *   response event.
     * @param  {Function} [param.beforeSend] A function called just before the
     *   send request. The first parameter of this function is the XHR object.
     * @return {Task<XMLHttpRequest>} The XHR
     */

    /*global XMLHttpRequest */
    var d = env.newDeferred(), xhr = new XMLHttpRequest(), k, i, l, a;
    d.promise.cancel = function () { xhr.abort(); };
    if (param.username) {
      xhr.open((param.method || "GET").toUpperCase(), param.url, true);
    } else {
      xhr.open((param.method || "GET").toUpperCase(), param.url, true, param.username, param.password);
    }
    xhr.responseType = param.responseType || "";
    if (param.overrideMimeType) {
      xhr.overrideMimeType(param.overrideMimeType);
    }
    if (param.withCredentials !== undefined) {
      xhr.withCredentials = param.withCredentials;
    }
    if (param.headers) {
      a = Object.keys(param.headers);
      l = a.length;
      for (i = 0; i < l; i += 1) {
        k = a[i];
        xhr.setRequestHeader(k, param.headers[k]);
      }
    }
    xhr.addEventListener("load", function (e) {
      if (param.getEvent) { return d.resolve(e); }
      var r, t = e.target;
      if (t.status < 400) { return d.resolve(t); }
      r = new Error("HTTP: " + (t.status ? t.status + " " : "") + (t.statusText || "Unknown"));
      r.target = t;
      return d.reject(r);
    }, false);
    xhr.addEventListener("error", function (e) {
      if (param.getEvent) { return d.resolve(e); }
      var r = new Error("HTTP: Error");
      r.target = e.target;
      return d.reject(r);
    }, false);
    xhr.addEventListener("abort", function (e) {
      if (param.getEvent) { return d.resolve(e); }
      var r = new Error("HTTP: Aborted");
      r.target = e.target;
      return d.reject(r);
    }, false);
    if (param.xhrFields) {
      a = Object.keys(param.xhrFields);
      l = a.length;
      for (i = 0; i < l; i += 1) {
        k = a[i];
        xhr[k] = param.xhrFields[k];
      }
    }
    if (typeof param.beforeSend === 'function') {
      param.beforeSend(xhr);
    }
    xhr.send(param.data);
    return d.promise;
  }
  env.newXmlHttpRequestTask = newXmlHttpRequestTask;

  ////////////////////
  // Worker helpers //
  ////////////////////

  function evalOnWorkerTask(value) {
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
    ].join("\n")], {type: "application/javascript"}))), d = env.newDeferred();
    d.promise.cancel = function () {
      worker.terminate();
      d.reject(new Error("evalOnWorkerTask cancelled"));
    };
    worker.onmessage = function (e) {
      if (e.data.length > 1) { d.reject(e.data[1]); } else { d.resolve(e.data[0]); }
      worker.terminate();
    };
    worker.postMessage(value);
    return d.promise;
  }
  env.evalOnWorkerTask = evalOnWorkerTask;

  /////////////////////////
  // Object Manipulation //
  /////////////////////////

  function copyObjectProperties(dst, src) {
    /*jslint plusplus: true */
    var i = 0, keys = Object.keys(src), l = keys.length, k;
    while (i < l) {
      k = keys[i++];
      dst[k] = src[k];
    }
    return dst;
  }
  env.copyObjectProperties = copyObjectProperties;

  function mixObjectProperties(dst, src) {
    /*jslint plusplus: true */
    var i = 0, keys = Object.keys(src), l = keys.length, k;
    while (i < l) {
      k = keys[i++];
      if (dst[k] !== undefined) { throw new Error("mixObjectProperties: property `" + k + "` already defined"); }
    }
    i = 0;
    while (i < l) {
      k = keys[i++];
      dst[k] = src[k];
    }
    return dst;
  }
  env.mixObjectProperties = mixObjectProperties;

  function setDefaultObjectProperties(dst, src) {
    /*jslint plusplus: true */
    var i = 0, keys = Object.keys(src), l = keys.length, k;
    while (i < l) {
      k = keys[i++];
      if (dst[k] === undefined) { dst[k] = src[k]; }
    }
    return dst;
  }
  env.setDefaultObjectProperties = setDefaultObjectProperties;

  ///////////////////////////
  // function manipulation //
  ///////////////////////////

  function functionsToGenerator(functions) {
    /**
     *     functionsToGenerator(functions): Generator
     *
     * Convert a sequence of function to a kind of generator function.
     * This function works with old ECMAScript version.
     *
     *     var config;
     *     functionsToGenerator([function () {
     *       return getConfig();
     *     }, function (_config) {
     *       config = _config;
     *       config.enableSomething = true;
     *       return sleep(1000);
     *     }, function () {
     *       return putConfig(config);
     *     }, [null, function (e) {
     *       console.error(e);
     *     }]]);
     *
     * @param  {Array} functions An array of function.
     * @return {Generator} A new Generator
     */
    return function () {
      var i = 0, g;
      function exec(f, value) {
        try {
          value = f(value);
          if (i === functions.length) {
            return {"done": true, "value": value};
          }
          return {"value": value};
        } catch (e) {
          return g.throw(e);
        }
      }
      g = {
        "next": function (value) {
          var f;
          while (i < functions.length) {
            if (Array.isArray(functions[i])) {
              f = functions[i][0];
            } else {
              f = functions[i];
            }
            if (typeof f === "function") {
              i += 1;
              return exec(f, value);
            }
            i += 1;
          }
          return {"done": true, "value": value};
        },
        "throw": function (value) {
          var f;
          while (i < functions.length) {
            if (Array.isArray(functions[i])) {
              f = functions[i][1];
            }
            if (typeof f === "function") {
              i += 1;
              return exec(f, value);
            }
            i += 1;
          }
          throw value;
        }
      };
      return g;
    };
  }
  env.functionsToGenerator = functionsToGenerator;

  //////////////////////////////
  // Constructor manipulation //
  //////////////////////////////

  env.new = function (Constructor) {
    /*jslint plusplus: true */
    var l = arguments.length - 1, i = 0, args = new Array(l);
    while (i < l) { args[i] = arguments[++i]; }
    i = Object.create(Constructor.prototype);
    Constructor.apply(i, args);
    return i;
  };

  function staticMethodNew() {
    var o = Object.create(this);
    this.apply(o, arguments);
    return o;
  }
  env.staticMethodNew = staticMethodNew;

  /////////////////////////
  // Regexp manipulation //
  /////////////////////////

  function regexpToStrings(regexp) {
    // regexpToStrings(/hello/g) -> ["hello", "g"]
    var strings = regexp.toString().split("/");
    return [strings.slice(1, -1).join("/"), strings[strings.length - 1]];
    //return [strings.slice(1, -1).join("/").replace(/\\\//g, "/"), strings[strings.length - 1]];
  }
  env.regexpToStrings = regexpToStrings;

  /////////////////////////////////////
  // Synchronous Writers and Readers //
  /////////////////////////////////////

  function BufferWriter(buffer) {
    // Usage:
    //   array = [1, 2];
    //   bufferWriter = new BufferWriter(array);
    //   bufferWriter.write([3, 4]); // returns: 2
    //   bufferWriter.index = 1;
    //   bufferWriter.write([5]); // returns: 1
    //   bufferWriter.buffer; // returns: [1, 5, 3, 4]
    this.buffer = buffer || [];
    this.index = this.buffer.length;
  }
  BufferWriter.prototype.buffer = null;
  BufferWriter.prototype.index = 0;
  BufferWriter.prototype.write = function (array) {
    //     write(array iterable) writenCount int
    /*jslint plusplus: true */
    var i = 0, l = array.length, buffer = this.buffer;
    while (i < l) { buffer[this.index++] = array[i++]; }
    return i;
  };
  env.BufferWriter = BufferWriter;
  env.newBufferWriter = function () { var c = env.BufferWriter, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  function ArrayWriter(array) {
    // Usage:
    //   array = [1, 2, 3];
    //   arrayWriter = new ArrayWriter(array);
    //   arrayWriter.write([4]); // returns: 1
    //   arrayWriter.index = 2;
    //   arrayWriter.write([5, 6]); // returns: 1
    //   arrayWriter.array; // returns: [4, 2, 5]
    this.array = array;
  }
  ArrayWriter.prototype.array = null;
  ArrayWriter.prototype.index = 0;
  ArrayWriter.prototype.write = function (array) {
    //     write(array iterable) writenCount int
    /*jslint plusplus: true */
    var i = 0, l = array.length, buffer = this.array, bl = buffer.length;
    while (i < l && this.index < bl) { buffer[this.index++] = array[i++]; }
    return i;
  };
  env.ArrayWriter = ArrayWriter;
  env.newArrayWriter = function () { var c = env.ArrayWriter, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  function ArrayReader(array) {
    // Usage:
    //   array = [1, 2, 3];
    //   arrayReader = new ArrayReader(array);
    //   arrayReader.read(2); // returns: [1, 2]
    //   arrayReader.index = 1;
    //   arrayReader.read(1); // returns: [2]
    //   arrayReader.read(2); // returns: [3]
    this.array = array || [];
  }
  ArrayReader.prototype.array = null;
  ArrayReader.prototype.index = 0;
  ArrayReader.prototype.read = function (count) {
    //     read([count int]) iterable
    // `count === undefined` means `count === Infinity`
    /*jslint plusplus: true */
    var res = [], i = 0, buffer = this.array, bl = buffer.length;
    if (count === undefined) {
      while (this.index < bl) { res[i++] = buffer[this.index++]; }
    } else {
      while (i < count && this.index < bl) { res[i++] = buffer[this.index++]; }
    }
    return res;
  };
  ArrayReader.prototype.readInto = function (array) {
    //     readInto(array) int
    //
    //     buf = [], count;
    //     do {
    //       buf.length = 1024;
    //       count = buf.length = r.readInto(buf);
    //       w.write(buf);
    //     } while (count);
    /*jslint plusplus: true */
    var i = 0, count = array.length, a = this.array, al = this.array.length;
    while (i < count && this.index < al) { array[i++] = a[this.index++]; }
    return i;
  };
  env.ArrayReader = ArrayReader;
  env.newArrayReader = function () { var c = env.ArrayReader, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  function StringReader(string) {
    // Usage:
    //   string = "abc";
    //   stringReader = new StringReader(string);
    //   stringReader.read(2); // returns: "ab"
    //   stringReader.index = 1;
    //   stringReader.read(1); // returns: "b"
    //   stringReader.read(2); // returns: "c"
    this.string = string || "";
  }
  StringReader.prototype.string = "";
  StringReader.prototype.index = 0;
  StringReader.prototype.read = function (count) {
    //     read([count int]) iterable
    // `count === undefined` means `count === Infinity`
    /*jslint plusplus: true */
    var res;
    if (count === undefined) {
      res = this.string.slice(this.index);
    } else {
      res = this.string.slice(this.index, this.index + count);
    }
    this.index += res.length;
    return res;
  };
  env.StringReader = StringReader;
  env.newStringReader = function () { var c = env.StringReader, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  ////////////////////////
  // Parsers and eaters //
  ////////////////////////

  function eatMimeType(text) {
    // see https://tools.ietf.org/html/rfc2045#section-5.1
    //   mimetype := type "/" subtype
    //     type /[a-z]+/
    //     subtype /[a-zA-Z_\-\.\+]+/
    var res = (/^([a-z]+)\/([a-zA-Z_\-\.\+]+)/).exec(text);
    if (res) {
      return {
        index: 0,
        input: text,
        match: res[0],
        type: res[1],
        subtype: res[2]
      };
    }
    return null;
  }
  env.eatMimeType = eatMimeType;

  function eatContentTypeParameter(text) {
    // see https://tools.ietf.org/html/rfc2045#section-5.1
    // here, it is not the strict rfc, this one handles the content type of `data: text/plain  ;=; charset = utf-8 ;base64,AAA=`
    // NB: should never return null
    //   content-type-parameter := attribute "=" value -> here, it's more: attribute ?("=" ?value)
    //     attribute := token
    //     value := token / quoted-string
    //       token /[a-zA-Z0-9!#\$%&'\*\+\-\.\^_`\{\|\}~]+/  // US-ASCII CHARS except ()<>@,;:\"/[]?=
    //       quoted-string /"(?:[^\\"]|\\[^])*"/ -> for jslint, [^] is not accepted, we can use [\s\S] (following RFC it should be [\x00-\x7F])
    /*jslint regexp: true */
    var res = (/^([a-zA-Z0-9!#\$%&'\*\+\-\.\^_`\{\|\}~]*)(?:\s*=\s*([a-zA-Z0-9!#\$%&'\*\+\-\.\^_`\{\|\}~]*|"(?:[^\\"]|\\[\s\S])*"))?/).exec(text);
    //if (res) {
    return {
      index: 0,
      input: text,
      match: res[0],
      attribute: res[1],
      value: res[2] === undefined ? null : (res[2][0] === "\"" ? res[2].slice(1, -1).replace(/\\([\s\S])/g, "$1") : res[2])
    };
    //}
    //return null;
  }
  env.eatContentTypeParameter = eatContentTypeParameter;

  function eatContentType(text) {
    // Returns an object containing all content-type information
    // Ex:
    // {
    //   input: "text/plain;charset=utf-8;base64,ABCDEFGH", // is the actual `contentType` parameter
    //   match: "text/plain;charset=utf-8;base64", // is what the parser matched
    //   mimetype: "text/plain", // is the mimetype
    //   params: { // is the content type parameters
    //     charset: "utf-8",
    //     base64: null
    //   }
    // }
    // NB: should never return null
    // see https://tools.ietf.org/html/rfc2045#section-5.1
    //   content-type := mimetype content-type-parameters
    //     content-type-parameters := / content-type-parameter content-type-parameters
    /*jslint ass: true */
    // mimetype
    var res = env.eatMimeType(text), tmp, whitespaceMatch;
    if (res === null) {
      res = {input: text, match: ""};
    } else {
      text = text.slice(res.match.length);
      res.mimetype = res.match;
    }
    res.params = {};
    // whitespaces
    tmp = (/^\s*/).exec(text);
    text = text.slice(tmp[0].length);
    res.match += tmp[0];
    while (true) {  // XXX while (true) is not optimizable
      // semicolon whitespaces
      if ((tmp = (/^(?:;\s*)+/).exec(text)) === null) { break; }
      text = text.slice(tmp[0].length);
      whitespaceMatch = tmp[0];
      // content-type-parameter
      if ((tmp = env.eatContentTypeParameter(text)) === null) { break; }
      text = text.slice(tmp.match.length);
      res.match += whitespaceMatch + tmp.match;
      res.params[tmp.attribute] = tmp.value;
      // whitespaces
      tmp = (/^\s*/).exec(text);
      text = text.slice(tmp[0].length);
      res.match += tmp[0];
    }
    return res;
  }
  env.eatContentType = eatContentType;

  //////////////
  // Escapers //
  //////////////

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  env.escapeHtml = escapeHtml;

  function escapeRegExp(text) {
    return text.replace(/([\\\[\]\{\}\(\)\.\?\*\+\^\$])/g, "\\$1");
  }
  env.escapeRegExp = escapeRegExp;

  //////////////
  // Encoders //
  //////////////

  function encodeBinaryStringToBase64Polyfill(binaryString) {
    /*jslint bitwise: true */
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", i = 0, l = binaryString.length, m = l % 3, lm = l - m, res = "", a, b, c;
    for (i = 0; i < lm; i += 3) {
      a = binaryString.charCodeAt(i);
      b = binaryString.charCodeAt(i + 1);
      c = binaryString.charCodeAt(i + 2);
      if (a > 0xFF || b > 0xFF || c > 0xFF) {
        a = new Error("String contains an invalid character");
        a.name = "InvalidCharacterError";
        throw a;
      }
      res += chars[(a >>> 2) & 0x3F] +
        chars[((a << 4) & 0x30) | ((b >>> 4) & 0xF)] +
        chars[((b << 2) & 0x3C) | ((c >>> 6) & 0x3)] +
        chars[(c & 0x3F)];
    }
    if (m === 2) {
      a = binaryString.charCodeAt(i);
      b = binaryString.charCodeAt(i + 1);
      if (a > 0xFF || b > 0xFF) {
        a = new Error("String contains an invalid character");
        a.name = "InvalidCharacterError";
        throw a;
      }
      res += chars[(a >>> 2) & 0x3F] +
        chars[((a << 4) & 0x30) | ((b >>> 4) & 0xF)] +
        chars[((b << 2) & 0x3C)] + "=";
    } else if (m === 1) {
      a = binaryString.charCodeAt(i);
      if (a > 0xFF) {
        a = new Error("String contains an invalid character");
        a.name = "InvalidCharacterError";
        throw a;
      }
      res += chars[(a >>> 2) & 0x3F] + chars[((a << 4) & 0x30)] + "==";
    }
    return res;
  }
  env.encodeBinaryStringToBase64Polyfill = encodeBinaryStringToBase64Polyfill;
  if (env.encodeBinaryStringToBase64 === null) { env.encodeBinaryStringToBase64 = env.encodeBinaryStringToBase64Polyfill; }

  function decodeBase64ToBinaryStringPolyfill(base64) {
    /*jslint bitwise: true, continue: true */
    // 43=62,47=63,48-57=x+4,65-90=x-65,97-122=x-71
    function charCodeToByte(chr) {
      if (chr >= 65 && chr <= 90) { return chr - 65; }
      if (chr >= 97 && chr <= 122) { return chr - 71; }
      if (chr >= 48 && chr <= 57) { return chr + 4; }
      if (chr === 43) { return 62; }
      if (chr === 47) { return 63; }
      var e = new Error("Failed to execute 'decodeBase64ToBinaryStringPolyfill': The string to be decoded is not correctly encoded.");
      e.name = "InvalidCharacterError";
      throw e;
    }
    var l = base64.length, res = "", chr, a, b, i;
    for (i = 0; i < l; i += 4) {
      // char1
      chr = base64.charCodeAt(i);
      b = charCodeToByte(chr) << 2;
      // char2
      chr = base64.charCodeAt(i + 1);
      a = charCodeToByte(chr);
      b |= a >>> 4;
      res += String.fromCharCode(b);
      // char3
      chr = base64.charCodeAt(i + 2);
      if (chr === undefined) { continue; }
      if (chr === 61) {
        if (base64.charCodeAt(i + 3) === 61) { continue; }
        throw charCodeToByte(null);
      }
      b = (a << 4) & 0xFF;
      a = charCodeToByte(chr);
      res += String.fromCharCode(b | (a >>> 2));
      // char4
      chr = base64.charCodeAt(i + 3);
      if (chr === 61) { continue; }
      res += String.fromCharCode(((a << 6) & 0xFF) | charCodeToByte(chr));
    }
    return res;
  }
  env.decodeBase64ToBinaryStringPolyfill = decodeBase64ToBinaryStringPolyfill;
  if (env.decodeBase64ToBinaryString === null) { env.decodeBase64ToBinaryString = env.decodeBase64ToBinaryStringPolyfill; }

  //////////////////////////////////////////////////////////////////////

  return env;
}(this));
