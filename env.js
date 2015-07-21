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

  //////////////////////////////////////////////////////////////////////

  return env;
}(this));
