/*jslint indent: 2 */
(function envPromises(env) {
  "use strict";

  /*! Copyright (c) 2015-2016 Tristan Cavelier <t.cavelier@free.fr>
      This program is free software. It comes without any warranty, to
      the extent permitted by applicable law. You can redistribute it
      and/or modify it under the terms of the Do What The Fuck You Want
      To Public License, Version 2, as published by Sam Hocevar. See
      http://www.wtfpl.net/ for more details. */

  // optional dependency: env.setImmediate
  // provides: env.{,new}Promise, env.{,new}Deferred
  // provides env.setImmediate if not already defined

  var setImmediate = typeof env.setImmediate === "function" ? env.setImmediate : (function () {
    var queue = [], timerCount = 0, maxTimers = 6, setImmediate;
    function exec() {
      timerCount -= 1;
      if (queue.length) { queue.shift()(); }
    }
    function setImmediatePolyfill(fn) {
      /*jslint plusplus: true */
      var l = arguments.length - 1, a = new Array(l), i = 0;
      while (i < l) { a[i] = arguments[++i]; }
      queue.push(fn.apply.bind(fn, null, a));
      while (++timerCount < maxTimers) { setTimeout(exec); }
      setTimeout(exec);
    }
    return setImmediatePolyfill;
  }());

  var RealPromise = typeof Promise === "function" ? Promise : (function () {

    function handleListener(previous, next, listener, offset) {
      /*global resolvePromise */
      var value;
      if (typeof listener !== "function") { return resolvePromise(next, previous["[[PromiseValue]]"], offset); }
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
      for (i = 0; i < l; i += 3) { setImmediate(handleListener, promise, a[i], a[i + offset], offset); }
    }

    function resolvePromise(promise, value, offset) {
      if (promise["[[PromiseStatus]]"] !== "pending") { return; }
      forceResolvePromise(promise, value, offset);
    }

    function PromisePolyfill(executor) {
      if (!(this instanceof PromisePolyfill)) { throw new TypeError(this + " is not a promise"); }
      if (typeof executor !== "function") { throw new TypeError("Promise resolver " + executor + " is not a function"); }
      this["[[PromiseStack]]"] = [];
      this["[[PromiseStatus]]"] = "pending";
      var priv = this;
      function resolve(value) { resolvePromise(priv, value, 1); }
      function reject(reason) { resolvePromise(priv, reason, 2); }
      try {
        executor(resolve, reject);
      } catch (reason) {
        resolvePromise(this, reason, 2);
      }
    }
    PromisePolyfill.prototype.then = function (onDone, onFail) {
      var next = new PromisePolyfill(function () { return; });
      if (this["[[PromiseStatus]]"] === "resolved") {
        setImmediate(handleListener, this, next, onDone, 1);
      } else if (this["[[PromiseStatus]]"] === "rejected") {
        setImmediate(handleListener, this, next, onFail, 2);
      } else {
        this["[[PromiseStack]]"].push(next, onDone, onFail);
      }
      return next;
    };
    PromisePolyfill.prototype.catch = function (onFail) { return this.then(null, onFail); };
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

  function Deferred() {
    var it = this;
    this.promise = env.newPromise(function (resolve, reject) {
      it.resolve = resolve;
      it.reject = reject;
    });
  }

  env.registerLib(envPromises);
  if (env.setImmediate === undefined) { env.setImmediate = setImmediate; }
  env.Promise = RealPromise;
  env.newPromise = function (executor) { return new env.Promise(executor); };
  env.Deferred = Deferred;
  env.newDeferred = function () { var c = env.Deferred, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

}(env));
