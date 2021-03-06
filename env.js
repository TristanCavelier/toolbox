/*jslint indent: 2 */
(function script(exportRoot, exportKey) {
  "use strict";

  /*! Copyright (c) 2015-2016 Tristan Cavelier <t.cavelier@free.fr>
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

  // API stability Levels (inspired from nodejs api):
  //   0 - Deprecated (red)
  //   1 - Experimental (orange)
  //   2 - Stable (green)
  //   3 - Locked (blue)
  // If no level is mentioned = 3 - Locked

  //////////////////////////////////////////////////////////////////////

  ////////////
  // Native //
  ////////////

  (function () {
    /*global setTimeout, clearTimeout, Promise, WeakMap,
             btoa, atob */
    env.setTimeout = typeof setTimeout === "function" ? setTimeout.bind(null) : null;
    env.clearTimeout = typeof clearTimeout === "function" ? clearTimeout.bind(null) : null;
    env.PromiseNative = typeof Promise === "function" ? Promise : null;
    env.WeakMapNative = typeof WeakMap === "function" ? WeakMap : null;
    env.encodeBinaryStringToBase64 = typeof btoa === "function" ? btoa.bind(null) : null;
    env.decodeBase64ToBinaryString = typeof atob === "function" ? atob.bind(null) : null;
  }());

  //////////////
  // Polyfill //
  //////////////

  env.newSetImmediateFunctionBasedOnSeveralSetTimeouts = function (maxTimers) {
    var queue = [], count = 0;
    if (maxTimers === undefined) { maxTimers = 6; }
    function exec() {
      count -= 1;
      if (queue.length) { queue.shift()(); }
    }
    function setImmediate(fn) {
      /*jslint plusplus: true */
      var l = arguments.length - 1, a = new Array(l), i = 0;
      while (i < l) { a[i] = arguments[++i]; }
      queue.push(fn.apply.bind(fn, null, a));
      while (++count < maxTimers) { setTimeout(exec); }
      setTimeout(exec);
    }
    return setImmediate;
  };

  if (env.PromiseNative === null) {
    env.setImmediate = env.newSetImmediateFunctionBasedOnSeveralSetTimeouts();
  } else {
    env.setImmediate = function (fn) {
      /*jslint plusplus: true */
      var l = arguments.length - 1, i = 0, args = new Array(l);
      while (i < l) { args[i] = arguments[++i]; }
      env.PromiseNative.resolve().then(fn.apply.bind(fn, null, args));
    };
  }

  env.PromisePolyfill = (function () {

    var queue = [], timerCount = 0, maxTimers = 6, wm;
    function exec() {
      timerCount -= 1;
      if (queue.length) { queue.shift()(); }
    }
    function setImmediate(fn) {
      /*jslint plusplus: true */
      var l = arguments.length - 1, a = new Array(l), i = 0;
      while (i < l) { a[i] = arguments[++i]; }
      queue.push(fn.apply.bind(fn, null, a));
      while (++timerCount < maxTimers) { setTimeout(exec); }
      setTimeout(exec);
    }
    if (env.WeakMapNative) {
      wm = new env.WeakMapNative();
    } else {
      wm = {get: function (a) { return a; }, set: function () { return; }};
    }

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
      wm.set(this, {});
      var priv = wm.get(this);
      priv["[[PromiseStack]]"] = [];
      priv["[[PromiseStatus]]"] = "pending";
      function resolve(value) { resolvePromise(priv, value, 1); }
      function reject(reason) { resolvePromise(priv, reason, 2); }
      try {
        executor(resolve, reject);
      } catch (reason) {
        resolvePromise(this, reason, 2);
      }
    }
    PromisePolyfill.prototype.then = function (onDone, onFail) {
      var next = new PromisePolyfill(function () { return; }), priv = wm.get(this);
      if (priv["[[PromiseStatus]]"] === "resolved") {
        setImmediate(handleListener, this, wm.get(next), onDone, 1);
      } else if (priv["[[PromiseStatus]]"] === "rejected") {
        setImmediate(handleListener, this, wm.get(next), onFail, 2);
      } else {
        priv["[[PromiseStack]]"].push(wm.get(next), onDone, onFail);
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

  env.Promise = env.PromiseNative === null ? env.PromisePolyfill : env.PromiseNative;
  env.newPromise = function (executor) { return new env.Promise(executor); };

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

  (function () {

    var wm;
    if (env.WeakMapNative) {
      wm = new env.WeakMapNative();
    } else {
      wm = {get: function (a) { return a; }, set: function () { return; }};
    }

    function magicDeferred() {
      var resolve, promise = env.newPromise(function (r) { resolve = r; });
      promise.cancel = resolve;
      promise.resume = resolve;
      return promise;
    }

    function InTaskController(deferred) {
      wm.set(this, {});
      var it = wm.get(this);
      it["[[InTaskControllerDeferred]]"] = deferred;
    }
    InTaskController.prototype.defer = function (fn) { wm.get(this)["[[InTaskControllerDeferred]]"].promise.then(fn, fn); };

    function Task(generatorFunction) {
      wm.set(this, {});
      var it = wm.get(this);
      // API stability level: 1 - Experimental
      it["[[TaskPromise]]"] = env.newPromise(function (resolve, reject) {
        var d = env.newDeferred(), g = generatorFunction.call(new InTaskController(d));
        function rec(method, prev) {
          /*jslint ass: true */
          if (it["[[TaskCancelled]]"]) { g = new Error("task cancelled"); d.resolve(g); return reject(g); }
          if (it["[[TaskPaused]]"]) { return (it["[[TaskSubPromise]]"] = magicDeferred()).then(rec.bind(this, method, prev)); }
          var next;
          try { next = g[method](prev); } catch (e) { d.resolve(e); return reject(e); }
          if (next.done) { d.resolve(next.value); return resolve(next.value); }
          it["[[TaskSubPromise]]"] = next = next.value;
          if (it["[[TaskCancelled]]"] && next && typeof next.then === "function" && typeof next.cancel === "function") { try { next.cancel(); } catch (e) { d.resolve(e); return reject(e); } }
          if (it["[[TaskPaused]]"] && next && typeof next.then === "function" && typeof next.pause === "function") { try { next.pause(); } catch (e) { d.resolve(e); return reject(e); } }
          if (!next || typeof next.then !== "function") { next = env.Promise.resolve(next); }  // `{ return rec.call(it, "next"); }` directly here to be as synchronous as possible
          return next.then(rec.bind(this, "next"), rec.bind(this, "throw"));
        }
        rec.call(this, "next");
      }.bind(this));
    }
    Task.prototype.then = function () { var p = wm.get(this)["[[TaskPromise]]"]; return p.then.apply(p, arguments); };
    Task.prototype.catch = function () { var p = wm.get(this)["[[TaskPromise]]"]; return p.catch.apply(p, arguments); };
    Task.prototype.cancel = function () {
      var it = wm.get(this), p;
      it["[[TaskCancelled]]"] = true;
      p = it["[[TaskSubPromise]]"];
      if (p && typeof p.then === "function" && typeof p.cancel === "function") { p.cancel(); }
      return this;
    };
    Task.prototype.pause = function () {
      var it = wm.get(this), p;
      it["[[TaskPaused]]"] = true;
      p = it["[[TaskSubPromise]]"];
      if (p && typeof p.then === "function" && typeof p.pause === "function") { p.pause(); }
      return this;
    };
    Task.prototype.resume = function () {
      var it = wm.get(this), p;
      delete it["[[TaskPaused]]"];
      p = it["[[TaskSubPromise]]"];
      if (p && typeof p.then === "function" && typeof p.resume === "function") { p.resume(); }
      return this;
    };
    Task.all = function (tasks) {
      // XXX make TaskAll constructor ? inherit from a TaskManager(tasks) (using [[TaskManager:i]]) ?
      var i, l = tasks.length, p = new Array(l), res = [], d = env.newDeferred(), count = l;
      for (i = 0; i < l; i += 1) { p[i] = tasks[i] && typeof tasks[i].then === "function" ? tasks[i] : env.Promise.resolve(tasks[i]); }
      d.promise.cancel = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.cancel === "function") { v.cancel(); } } };
      d.promise.pause  = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.pause  === "function") { v.pause();  } } };
      d.promise.resume = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.resume === "function") { v.resume(); } } };
      function solver(j, v) {
        /*jslint plusplus: true */
        res[j] = v;
        if (--count === 0) { d.resolve(res); }
      }
      for (i = 0; i < l; i += 1) { p[i].then(solver.bind(null, i), d.reject); }
      return d.promise;
    };
    Task.race = function (tasks) {
      var i, l = tasks.length, p = new Array(l), d = env.newDeferred();
      for (i = 0; i < l; i += 1) { p[i] = tasks[i] && typeof tasks[i].then === "function" ? tasks[i] : env.Promise.resolve(tasks[i]); }
      d.promise.cancel = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.cancel === "function") { v.cancel(); } } };
      d.promise.pause  = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.pause  === "function") { v.pause();  } } };
      d.promise.resume = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.resume === "function") { v.resume(); } } };
      for (i = 0; i < l; i += 1) { p[i].then(d.resolve, d.reject); }
      return d.promise;
    };
    Task.raceWinOrCancel = function (tasks) {
      // API stability level: 1 - Experimental
      var i, l = tasks.length, p = new Array(l), d = env.newDeferred();
      for (i = 0; i < l; i += 1) { p[i] = tasks[i] && typeof tasks[i].then === "function" ? tasks[i] : env.Promise.resolve(tasks[i]); }
      d.promise.cancel = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.cancel === "function") { v.cancel(); } } };
      d.promise.pause  = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.pause  === "function") { v.pause();  } } };
      d.promise.resume = function () { var j, v; for (j = 0; j < l; j += 1) { v = p[j]; if (v && typeof v.then === "function" && typeof v.resume === "function") { v.resume(); } } };
      d.promise.then(d.promise.cancel);  // XXX cancel only loosers ?
      for (i = 0; i < l; i += 1) { p[i].then(d.resolve, d.reject); }
      return d.promise;
    };
    env.Task = Task;
    env.newTask = function () { var c = env.Task, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

    function TaskThen(previous, onDone, onFail) {
      wm.set(this, {});
      var it = wm.get(this);
      // API stability level: 1 - Experimental
      function rec(fn, v) {
        /*jslint ass: true */
        if (it["[[TaskCancelled]]"]) { throw new Error("task cancelled"); }
        if (it["[[TaskPaused]]"]) { return new TaskThen(it["[[TaskSubPromise]]"] = magicDeferred(), rec.bind(it, fn, v)); }
        var p = it["[[TaskSubPromise]]"] = fn(v);
        if (it["[[TaskCancelled]]"] && p && typeof p.then === "function" && typeof p.cancel === "function") { p.cancel(); }
        if (it["[[TaskPaused]]"] && p && typeof p.then === "function" && typeof p.pause === "function") { p.pause(); }
        return p;
      }
      previous = it["[[TaskSubPromise]]"] = previous && typeof previous.then === "function" ? previous : env.Promise.resolve();
      it["[[TaskPromise]]"] = previous.then(typeof onDone === "function" ? rec.bind(it, onDone) : onDone, typeof onFail === "function" ? rec.bind(it, onFail) : onFail);
    }
    TaskThen.prototype = Object.create(env.Task.prototype);
    env.TaskThen = TaskThen;
    env.newTaskThen = function () { var c = env.TaskThen, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

    Task.sequence = function (sequence) {
      // API stability level: 1 - Experimental

      /*jslint plusplus: true */
      var i = 0, l = sequence.length, p, s;
      while (i < l) {
        s = sequence[i++];
        if (Array.isArray(s)) {
          p = new env.TaskThen(p, s[0], s[1]);
        } else {
          p = new env.TaskThen(p, s);
        }
      }
      return p || env.Promise.resolve();
    };
  }());
  env.task = env.newTask.bind(null);

  function TaskSequence(sequence) {
    // API stability level: 0 - Deprecated
    /*global console */
    if (TaskSequence["[[TaskSequenceDeprecated]]"]) {
      delete TaskSequence["[[TaskSequenceDeprecated]]"];
      try { console.warn("TaskSequence is deprecated, please use Task.sequence instead"); } catch (ignore) {}
    }
    this["[[TaskSequencePromise]]"] = env.Task.sequence(sequence);
  }
  TaskSequence["[[TaskSequenceDeprecated]]"] = true;
  TaskSequence.prototype["[[TaskSequencePromise]]"] = null;
  TaskSequence.prototype.then = function (a, b) { return this["[[TaskSequencePromise]]"].then(a, b); };
  TaskSequence.prototype.catch = function (a) { return this["[[TaskSequencePromise]]"].catch(a); };
  TaskSequence.prototype.cancel = function (a) { this["[[TaskSequencePromise]]"].cancel(a); };
  TaskSequence.prototype.pause = function (a) { this["[[TaskSequencePromise]]"].pause(a); };
  TaskSequence.prototype.resume = function (a) { this["[[TaskSequencePromise]]"].resume(a); };
  env.TaskSequence = TaskSequence;
  env.newTaskSequence = function () { var c = env.TaskSequence, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  (function () {

    function channelDeferred(v, channel, key) {
      var d = {
        value: v,
        channel: channel,
        channelKey: key,
        resolve: null,
        reject: null,
        promise: null
      };
      d.promise = env.newPromise(function (r, j) {
        d.resolve = r;
        d.reject = j;
      });
      d.promise.cancel = function () {
        delete d.channel[d.channelKey];
        delete d.value;
        d.done = true;
        d.reject(new Error("cancelled"));
      };
      return d;
    }

    function channelFifoPush(channel, type, value) {
      var hik = "[[Channel:" + type + ":headIndex]]",
        hi = channel[hik] || 0,
        lk = "[[Channel:" + type + ":length]]",
        hk = "[[Channel:" + type + ":" + hi + "]]",
        deferred = channelDeferred(value, channel, hk);
      channel[hk] = deferred;
      channel[hik] = hi + 1;
      channel[lk] = (channel[lk] || 0) + 1;
      return deferred;
    }
    function channelFifoPop(channel, type) {
      var v, tik = "[[Channel:" + type + ":tailIndex]]",
        ti = channel[tik] || 0,
        hi = channel["[[Channel:" + type + ":headIndex]]"] || 0,
        vk = "[[Channel:" + type + ":" + ti + "]]";
      if (ti < hi) {
        v = channel[vk];
        delete channel[vk];
        channel[tik] = ti + 1;
        channel["[[Channel:" + type + ":length]]"] -= 1;
        return v;
      }
    }

    function Channel(capacity) {
      // API stability level: 1 - Experimental
      if (capacity > 0) { this["[[ChannelCapacity]]"] = capacity; }
    }
    Channel.CLOSED_ERROR = Channel.prototype.CLOSED_ERROR = new Error("closed channel");
    Channel.prototype.getLength = function () { return this["[[Channel:send:length]]"] || 0; };
    Channel.prototype.getCapacity = function () { return this["[[ChannelCapacity]]"] || 0; };
    Channel.prototype.close = function () {
      /*jslint ass: true */
      this["[[ChannelError]]"] = Channel.CLOSED_ERROR;
      var next;
      while (this["[[Channel:next:length]]"] > 0) {
        next = channelFifoPop(this, "next");
        if (next && !next.done) { return next.resolve({done: true}); }
      }
    };
    Channel.prototype.throw = function (e) {
      /*jslint ass: true */
      this["[[ChannelError]]"] = e;
      var next;
      while (this["[[Channel:next:length]]"] > 0) {
        next = channelFifoPop(this, "next");
        if (next && !next.done) { return next.reject(e); }
      }
    };
    Channel.prototype.send = function (v) {
      /*jslint plusplus: true, ass: true */
      var next, send;
      if (this["[[ChannelError]]"]) { return env.Promise.reject(this["[[ChannelError]]"]); }
      while (this["[[Channel:next:length]]"] > 0) {
        next = channelFifoPop(this, "next");
        if (next && !next.done) { return next.resolve({value: v}); }
      }
      send = channelFifoPush(this, "send", v);
      if (this["[[Channel:send:length]]"] <= this["[[ChannelCapacity]]"]) { send.resolve(); }  // XXX dont return ?
      return send.promise;
    };
    Channel.prototype.next = function () {
      /*jslint plusplus: true, ass: true */
      var send;
      while (this["[[Channel:send:length]]"] > 0) {
        send = channelFifoPop(this, "send");
        if (send && !send.done) {
          send.resolve();
          return env.Promise.resolve({value: send.value});  // XXX dont return {value: value} directly ?
        }
      }
      if (this["[[ChannelError]]"]) {
        if (this["[[ChannelError]]"] === Channel.CLOSED_ERROR) {
          return env.Promise.resolve({done: true});  // XXX dont return {done: true} directly ?
        }
        return env.Promise.reject(this["[[ChannelError]]"]);
      }
      return channelFifoPush(this, "next").promise;
    };
    Channel.select = function (cases) {
      // API stability level: 1 - Experimental
      var i, l = cases.length, r = new Array(l), fn = new Array(l);
      function nop() { return; }
      function wrap(i, v) { return {index: i, value: v}; }
      for (i = 0; i < l; i += 1) {
        if (typeof cases[i] === "function") {
          fn[i] = cases[i];
          r[i] = env.Task.sequence([nop, wrap.bind(null, i)]);
        } else {
          fn[i] = cases[i][1];
          r[i] = env.Task.sequence([cases[i][0].next.bind(cases[i][0]), wrap.bind(null, i)]);
        }
      }
      return env.Task.sequence([env.Task.raceWinOrCancel.bind(null, r), function (o) {
        return fn[o.index](o.value);
      }]);
    };

    env.Channel = Channel;
    env.newChannel = function () { var c = env.Channel, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  }());

  /////////////////////
  // Event Mechanism //
  /////////////////////

  function EventManager() {
    // can be mixed in with:
    //     env.mixObjectProperties(Constructor.prototype, EventManager.prototype);

    // API stability level: 1 - Experimental
    return;
  }
  EventManager.prototype.addEventListener = function (type, listener) {
    //if (typeof listener !== "function") { return; }
    var key = "[[EventManagerListeners:" + type + "]]";
    if (this[key]) {
      this[key].push(listener);
    } else {
      this[key] = [listener];
    }
  };
  EventManager.prototype.removeEventListener = function (type, listener) {
    /*jslint plusplus: true */
    var key = "[[EventManagerListeners:" + type + "]]", listeners = this[key] || [], i, l = listeners.length;
    for (i = 0; i < l; i += 1) {
      if (listeners[i] === listener) {
        if (l === 1) {
          delete this[key];
          return;
        }
        while (i < l) { listeners[i] = listeners[++i]; }
        listeners.length -= 1;
        return;
      }
    }
  };
  EventManager.prototype.dispatchEvent = function (event) {
    var key = "[[EventManagerListeners:" + event.type + "]]", key2 = "on" + event.type, listeners = this[key] || [], i, l = listeners.length;
    if (typeof this[key2] === "function") {
      try { this[key2](event); } catch (ignore) {}
    }
    for (i = 0; i < l; i += 1) {
      try { listeners[i](event); } catch (ignore) {}
    }
  };
  env.EventManager = EventManager;
  env.newEventManager = function () { var c = env.EventManager, o = Object.create(c.prototype); c.apply(o, arguments); return o; };


  ///////////////////////
  // Time manipulation //
  ///////////////////////

  function sleepTask(ms) {
    var timer, rejecter, promise = env.newPromise(function (resolve, reject) {
      timer = env.setTimeout(resolve, ms);
      rejecter = reject;
    });
    promise.cancel = function () {
      env.clearTimeout(timer);
      rejecter(new Error("cancelled"));
    };
    return promise;
  }
  env.task.sleep = sleepTask;


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
    // [ { "href": string,  // raw url as written in the html
    //     "attributeName": string,  // the attribute where the url was found (optional)
    //     "element": HTMLElement}, ...]

    // API stability level: 2 - Stable

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
            href: tmp,
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
            href: tmp,
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
    //   [ "Server", "SimpleHTTP/0.6 Python/3.4.1",
    //     "Date", "Wed, 04 Jun 2014 14:06:57 GMT",
    //     "Value", "hello guys",  // XXX check if it is the good behavior (refer to `xhr.getResponseHeader("Value")`)
    //     "Content-Type", "application/x-silverlight",
    //     "Content-Length", "11240",
    //     "Last-Modified", "Mon, 03 Dec 2012 23:51:07 GMT",
    //     "X-Cache", "HIT via me",
    //     "X-Cache", "HIT via other" ]

    // API stability level: 2 - Stable

    /*jslint regexp: true */
    var result = [], key, value = "", line, split = text.split("\r\n"), i = 0, l = split.length;
    while (i < l) {
      line = split[i];
      i += 1;
      if (line[0] === " " || line[0] === "\t") {
        value += " " + line.replace(/^\s*/, "").replace(/\s*$/, "");
      } else {
        if (key) { result.push(key, value); }
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
     *    newXmlHttpRequestTask({url: location, responseType: "text"}).then(propertyGetter("responseText"));
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
     * @param  {Function} [param.onProgress] A listener that will be attach to the XHR
     * @param  {Function} [param.onUploadProgress] A listener that will be attach to the XHR upload
     * @param  {Function} [param.beforeSend] A function called just before the
     *   send request. The first parameter of this function is the XHR object.
     * @return {Task<XMLHttpRequest>} The XHR
     */

    // API stability level: 2 - Stable

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
    if (typeof param.onProgress === "function") {
      xhr.addEventListener("progress", param.onProgress);
    }
    if (typeof param.onUploadProgress === "function") {
      xhr.upload.addEventListener("progress", param.onUploadProgress);
    }
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
  env.task.newXmlHttpRequest = newXmlHttpRequestTask;
  env.task.xhr = newXmlHttpRequestTask;

  ////////////////////
  // Worker helpers //
  ////////////////////

  function evalOnWorkerTask(value) {
    // API stability level: 1 - Experimental

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
  env.task.evalOnWorker = evalOnWorkerTask;

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

  function getPropertyPath(object, path) {
    // value = getPropertyPath(object, ["feed", "items", 0, "title"])

    /*jslint plusplus: true */
    var i = 0, l = path.length;
    while (i < l) { object = object[path[i++]]; }
    return object;
  }
  env.getPropertyPath = getPropertyPath;

  function setPropertyPath(object, path, value) {
    /*jslint plusplus: true */
    var i = 0, l = path.length - 1;
    while (i < l) { object = object[path[i++]]; }
    object[path[i]] = value;
    return value;
  }
  env.setPropertyPath = setPropertyPath;

  function softGetPropertyPath(object, path) {
    try {
      return env.getPropertyPath(object, path);
    } catch (ignored) {
      return undefined;
    }
  }
  env.softGetPropertyPath = softGetPropertyPath;


  ////////////////////////
  // Array manipulation //
  ////////////////////////

  function copySliceInto(src, dst, srci, dsti, len) {
    /*jslint plusplus: true */
    while (len-- > 0) { dst[dsti++] = src[srci++]; }
  }
  env.copySliceInto = copySliceInto;

  ///////////////////////////
  // function manipulation //
  ///////////////////////////

  (function () {
    function executeFunction(f, value) {
      try {
        value = f(value);
        if (this["[[GeneratorFromFunctionsIndex]]"] === this["[[GeneratorFromFunctionsFunctions]]"].length) {
          return {"done": true, "value": value};
        }
        return {"value": value};
      } catch (e) {
        return this.throw(e);
      }
    }
    function GeneratorFromFunctions(functions) {
      this["[[GeneratorFromFunctionsFunctions]]"] = functions;
      this["[[GeneratorFromFunctionsIndex]]"] = 0;
    }
    GeneratorFromFunctions.prototype.next = function (value) {
      var i = this["[[GeneratorFromFunctionsIndex]]"], functions = this["[[GeneratorFromFunctionsFunctions]]"], f;
      while (i < functions.length) {
        f = functions[i];
        if (typeof f === "function") {
          this["[[GeneratorFromFunctionsIndex]]"] = i + 1;
          return executeFunction.call(this, f, value);
        }
        if (f && typeof f[0] === "function") {
          this["[[GeneratorFromFunctionsIndex]]"] = i + 1;
          return executeFunction.call(this, f[0], value);
        }
        i += 1;
      }
      this["[[GeneratorFromFunctionsIndex]]"] = i;
      return {"done": true, "value": value};
    };
    GeneratorFromFunctions.prototype.throw = function (reason) {
      var i = this["[[GeneratorFromFunctionsIndex]]"], functions = this["[[GeneratorFromFunctionsFunctions]]"], f;
      while (i < functions.length) {
        f = functions[i];
        if (f && typeof f[1] === "function") {
          this["[[GeneratorFromFunctionsIndex]]"] = i + 1;
          return executeFunction.call(this, f[1], reason);
        }
        i += 1;
      }
      this["[[GeneratorFromFunctionsIndex]]"] = i;
      throw reason;
    };
    env.GeneratorFromFunctions = GeneratorFromFunctions;
    env.newGeneratorFromFunctions = function () { var c = env.GeneratorFromFunctions, o = Object.create(c.prototype); c.apply(o, arguments); return o; };
  }());

  function makeGeneratorFunctionFromFunctions(functions) {
    /**
     *     makeGeneratorFunctionFromFunctions(functions): GeneratorFunction
     *
     * Convert a sequence of function to a kind of generator function.
     * This function works with old ECMAScript version.
     *
     *     var config;
     *     return task(makeGeneratorFunctionFromFunctions([function () {
     *       return getConfig();
     *     }, function (_config) {
     *       config = _config;
     *       config.enableSomething = true;
     *       return sleep(1000);
     *     }, function () {
     *       return putConfig(config);
     *     }, [null, function (e) {
     *       console.error(e);
     *     }]]));
     *
     * @param  {Array} functions An array of function.
     * @return {GeneratorFunction} A new GeneratorFunction
     */
    return env.newGeneratorFromFunctions.bind(env, functions);
  }
  env.makeGeneratorFunctionFromFunctions = makeGeneratorFunctionFromFunctions;

  //////////////////////////////
  // Constructor manipulation //
  //////////////////////////////

  env.new = function (Constructor) {
    // env.newPromise = env.new.bind(null, Promise)

    // API stability level: 2 - Stable

    /*jslint plusplus: true */
    var l = arguments.length - 1, i = 0, args = new Array(l);
    while (i < l) { args[i] = arguments[++i]; }
    i = Object.create(Constructor.prototype);
    Constructor.apply(i, args);
    return i;
  };

  function staticMethodNew() {
    // API stability level: 2 - Stable
    var o = Object.create(this);
    this.apply(o, arguments);
    return o;
  }
  env.staticMethodNew = staticMethodNew;

  /////////////////////////
  // Regexp manipulation //
  /////////////////////////

  function parseRegExpToStrings(regexp) {
    // parseRegExpToStrings(/hello/g) -> ["hello", "g"]
    var strings = regexp.toString().split("/");
    return [strings.slice(1, -1).join("/"), strings[strings.length - 1]];
    //return [strings.slice(1, -1).join("/").replace(/\\\//g, "/"), strings[strings.length - 1]];
  }
  env.parseRegExpToStrings = parseRegExpToStrings;

  /////////////////////
  // Type converters //
  /////////////////////

  function readBlobAsArrayBufferTask(blob) {
    /*global FileReader */
    var d = env.newDeferred(), fr = new FileReader();
    fr.onload = function (ev) { return d.resolve(ev.target.result); };
    fr.onerror = function () { return d.reject(new Error("unable to read blob as arraybuffer")); };
    fr.onabort = function () { return d.reject(new Error("cancelled")); };
    d.promise.cancel = function () { fr.abort(); };
    fr.readAsArrayBuffer(blob);
    return d.promise;
  }
  env.task.readBlobAsArrayBuffer = readBlobAsArrayBufferTask;

  function readBlobAsTextTask(blob) {
    /*global FileReader */
    var d = env.newDeferred(), fr = new FileReader();
    fr.onload = function (ev) { return d.resolve(ev.target.result); };
    fr.onerror = function () { return d.reject(new Error("unable to read blob as text")); };
    fr.onabort = function () { return d.reject(new Error("cancelled")); };
    d.promise.cancel = function () { fr.abort(); };
    fr.readAsText(blob);
    return d.promise;
  }
  env.task.readBlobAsText = readBlobAsTextTask;


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

    // API stability level: 1 - Experimental
    this.buffer = buffer || [];
    this.index = this.buffer.length;
  }
  BufferWriter.prototype.buffer = null;
  BufferWriter.prototype.index = 0;
  BufferWriter.prototype.write = function (array, from, length) {
    //     write(array array, from, length int) writenCount int
    /*jslint plusplus: true */
    var i = from, buffer = this.buffer;
    while (i < length) { buffer[this.index++] = array[i++]; }
    return i - from;
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

    // API stability level: 1 - Experimental
    this.array = array;
  }
  ArrayWriter.prototype.array = null;
  ArrayWriter.prototype.index = 0;
  ArrayWriter.prototype.write = function (array, from, length) {
    //     write(array array, from, length int) writenCount int
    /*jslint plusplus: true */
    var i = from, buffer = this.array, bl = buffer.length;
    while (i < length && this.index < bl) { buffer[this.index++] = array[i++]; }
    return i - from;
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

    // API stability level: 1 - Experimental
    this.raw = array || [];
  }
  ArrayReader.prototype.raw = null;
  ArrayReader.prototype.index = 0;
  ArrayReader.prototype.read = function (count) {
    //     read([count int]) array
    // `count === undefined` means "size of internal buffer"
    /*jslint plusplus: true */
    var res = [], i = 0, b = this.raw, bl = b.length;
    if (count === undefined) {
      while (this.index < bl) { res[i++] = b[this.index++]; }
    } else {
      while (i < count && this.index < bl) { res[i++] = b[this.index++]; }
    }
    return res;
  };
  ArrayReader.prototype.readInto = function (array, from, length) {
    //     readInto(array array, from, length int) readCount int
    //
    //     buf = [];
    //     do {
    //       buf.length = 1024;
    //       buf.length = r.readInto(buf);
    //       w.write(buf);
    //     } while (buf.length);

    /*jslint plusplus: true */
    var i = from, a = this.raw, al = a.length;
    while (i < length && this.index < al) { array[i++] = a[this.index++]; }
    return i - from;
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

    // API stability level: 1 - Experimental
    this.raw = string || "";
  }
  StringReader.prototype = Object.create(ArrayReader.prototype);  // XXX inherit or mix ?
  StringReader.prototype.readString = function (length) {
    //     readString([length int]) array
    var res;
    if (length === undefined) {
      res = this.raw.slice(this.index);
    } else {
      res = this.raw.slice(this.index, this.index + length);
    }
    this.index += res.length;
    return res;
  };
  env.StringReader = StringReader;
  env.newStringReader = function () { var c = env.StringReader, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  function MultiReader() {
    //     MultiReader(readers...)

    // API stability level: 1 - Experimental

    /*jslint plusplus: true */
    var i = 0, l = arguments.length, readers = new Array(l);
    while (i < l) { readers[i] = arguments[i++]; }
    this.readers = readers;
  }
  MultiReader.prototype.readInto = function (array, from, length) {
    //     readInto(array array, from, length int) readCount int
    //if (typeof from === "number" || !(from >= 0)) { from = 0; }
    //if (typeof length === "number" || !(length <= array.length - from)) { length = array.length - from; }
    var count = 0;
    while (this.readers.length > 0) {
      count += this.readers[0].readInto(array, from, length);
      from += count;
      length -= count;
      if (from === array.length) { return count; }
      this.readers.shift();
    }
    return count;
  };
  env.MultiReader = MultiReader;
  env.newMultiReader = function () { var c = env.MultiReader, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  function MultiWriter() {
    //     MultiReader(readers...)

    // API stability level: 1 - Experimental

    /*jslint plusplus: true */
    var i = 0, l = arguments.length, writers = new Array(l);
    while (i < l) { writers[i] = arguments[i++]; }
    this.writers = writers;
  }
  MultiWriter.prototype.write = function (array, from, length) {
    var i = 0, l = this.writers.length, n;
    while (i < l) {
      n = this.writers[i].write(array, from, length);
      if (n !== length) { throw new Error("short write"); }
      i += 1;
    }
    return length;
  };
  env.MultiWriter = MultiWriter;
  env.newMultiWriter = function () { var c = env.MultiWriter, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  function TeeReader(reader, writer) {
    // API stability level: 1 - Experimental
    this.reader = reader;
    this.writer = writer;
  }
  TeeReader.prototype.readInto = function (array, from, length) {
    length = this.reader.readInto(array, from, length);
    this.writer.write(array, from, length);
    return length;
  };
  env.TeeReader = TeeReader;
  env.newTeeReader = function () { var c = env.TeeReader, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

  ////////////////////////
  // Parsers and eaters //
  ////////////////////////

  function eatMimeType(text) {
    // see https://tools.ietf.org/html/rfc2045#section-5.1
    //   mimetype := type "/" subtype
    //     type /[a-z]+/
    //     subtype /[a-zA-Z_\-\.\+]+/

    // API stability level: 2 - Stable
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

    // API stability level: 2 - Stable

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

    // API stability level: 2 - Stable

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

  function parseStringifiedRegExp(string) {
    // parseStringifiedRegExp("/hello/g") -> /hello/g

    // API stability level: 2 - Stable

    /*jslint regexp: true */
    var res = /^\/((?:\\.|[^\\\/])*)\/([gimy]{0,4})$/.exec(string);  // this regexp does not handle flag errors!
    if (res) {
      try { return new RegExp(res[1], res[2]); } catch (ignore) {}  // only this part checks for flag errors.
    }
    return null;
  }
  env.parseStringifiedRegExp = parseStringifiedRegExp;

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

  function encodeArrayBufferToHexadecimal(arrayBuffer) {
    /*jslint bitwise: true */
    function bit4tohexchar(b) {
      //if (b > 0x9) { return b + 55; }  // upper case
      if (b > 0x9) { return b + 87; }  // lower case
      return b + 48;
    }
    /*global Uint8Array */
    arrayBuffer = new Uint8Array(arrayBuffer);
    var r = new Uint8Array(arrayBuffer.length * 2), c, i, j = 0;
    for (i = 0; i < arrayBuffer.length; i += 1) {
      c = arrayBuffer[i];
      if (c > 0xF) {
        r[j] = bit4tohexchar(c >> 4);
      } else {
        r[j] = 48;
      }
      r[j + 1] = bit4tohexchar(c & 0xF);
      j += 2;
    }
    return String.fromCharCode.apply(String, r);
  }
  env.encodeArrayBufferToHexadecimal = encodeArrayBufferToHexadecimal;

  function encodeBinaryStringToHexadecimal(binaryString) {
    // This method acts like `btoa` but returns a hexadecimal encoded string

    /*jslint bitwise: true */
    function bit4tohexchar(b) {
      //if (b > 0x9) { return b + 55; }  // upper case
      if (b > 0x9) { return b + 87; }  // lower case
      return b + 48;
    }
    /*global Uint8Array */
    var r = new Uint8Array(binaryString.length * 2), c, i, j = 0;
    for (i = 0; i < binaryString.length; i += 1) {
      c = binaryString.charCodeAt(i);
      if (c > 0xFF) {
        c = new Error("String contains an invalid character");
        c.name = "InvalidCharacterError";
        throw c;
      }
      if (c > 0xF) {
        r[j] = bit4tohexchar(c >> 4);
      } else {
        r[j] = 48;
      }
      r[j + 1] = bit4tohexchar(c & 0xF);
      j += 2;
    }
    return String.fromCharCode.apply(String, r);
  }
  env.encodeBinaryStringToHexadecimal = encodeBinaryStringToHexadecimal;

  function decodeHexadecimalToArrayBuffer(text) {
    /*global Uint8Array */
    var r, i, c;
    text = text.replace(/\s/g, "");
    if (text.length % 2) {
      text += "0";
      r = new Uint8Array((text.length / 2) + 1);
    } else {
      r = new Uint8Array(text.length / 2);
    }
    for (i = 0; i < text.length; i += 2) {
      c = (parseInt(text[i], 16) * 0x10) + parseInt(text[i + 1], 16);
      if (isNaN(c)) {
        c = new Error("String contains an invalid character");
        c.name = "InvalidCharacterError";
        c.code = 5;
        throw c;
      }
      r[i / 2] = c;
    }
    return r.buffer;
  }
  env.decodeHexadecimalToArrayBuffer = decodeHexadecimalToArrayBuffer;

  function decodeHexadecimalToBinaryString(text) {
    // This method acts like `atob` but parses a hexadecimal encoded string

    /*global Uint8Array */
    return String.fromCharCode.apply(String, new Uint8Array(env.decodeHexadecimalToArrayBuffer(text)));
  }
  env.decodeHexadecimalToBinaryString = decodeHexadecimalToBinaryString;

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

  function encodeBlobToBase64TaskPolyfill(blob) {
    /*global Uint8Array */
    return env.Task.sequence([
      function () { return env.task.readBlobAsArrayBuffer(blob); },
      function (ab) { return env.encodeBinaryStringToBase64(String.fromCharCode.apply(null, new Uint8Array(ab))); }
    ]);
  }
  env.task.encodeBlobToBase64Polyfill = encodeBlobToBase64TaskPolyfill;
  env.task.encodeBlobToBase64 = encodeBlobToBase64TaskPolyfill;

  function encodeBlobToBase64TaskNative(blob) {
    var d = env.newDeferred(), fr = new FileReader();
    fr.onload = function (ev) { return d.resolve(ev.target.result.slice(37)); };
    fr.onerror = function () { return d.reject(new Error("Unable to read blob as data url")); };
    fr.onabort = function () { return d.reject(new Error("Cancelled")); };
    d.promise.cancel = function () { fr.abort(); };
    fr.readAsDataURL(new Blob([blob], {"type": "application/octet-stream"}));
    return d.promise;
  }

  encodeBlobToBase64TaskNative(new Blob(["hello"], {"type": "text/plain;charset=ascii"})).then(function (text) {
    /*global console */
    if (text === "aGVsbG8=") {
      if (env.task.encodeBlobToBase64Native === undefined) { env.task.encodeBlobToBase64Native = encodeBlobToBase64TaskNative; }
      if (env.task.encodeBlobToBase64 === encodeBlobToBase64TaskPolyfill) { env.task.encodeBlobToBase64 = encodeBlobToBase64TaskNative; }
      return;
    }
    console.warn("env: encodeBlobToBase64Task cannot be encodeBlobToBase64TaskNative -> aGVsbG8= != " + text);
  });

  //////////////////////
  // Bit manipulators //
  //////////////////////

  function leftRotateInt32Bits(num, cnt) {
    /*jslint bitwise: true */
    return (num << cnt) | (num >>> (32 - cnt));
  }
  env.leftRotateInt32Bits = leftRotateInt32Bits;

  /////////////
  // Hashers //
  /////////////

  function md5sumArrayBuffer(message) {
    // @param  {ArrayBuffer} message
    // @return {ArrayBuffer} hash

    // Info: Uint32Array endianness is always little-endian in javascript
    // API stability level: 2 - Stable

    /*global Uint8Array, Uint32Array */
    var mod, padding2,
      leftrotate = env.leftRotateInt32Bits,
      memcpy = env.copySliceInto,
      hash = new Uint32Array(4),
      padding = new Uint8Array(64),
      M = new Uint32Array(16),
      bl = message.byteLength,
      s = [
        7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
        5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
        4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
        6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21
      ],
      K = [
        0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
        0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
        0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
        0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
        0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
        0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
        0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
        0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
        0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
        0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
        0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
        0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
        0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
        0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
        0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
        0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391
      ];
    memcpy([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476], hash, 0, 0, 4);
    message = new Uint8Array(message);

    padding = new Uint32Array(padding.buffer);
    padding[14] = bl * 8;
    padding[15] = bl * 8 / 0x100000000;
    padding = new Uint8Array(padding.buffer);

    mod = bl % 64;
    if (mod) {
      bl -= mod;
      if (mod > 56) {
        padding2 = new Uint8Array(64);
        memcpy(message, padding2, bl, 0, mod);
        padding2[mod] = 0x80;
      } else {
        memcpy(message, padding, bl, 0, mod);
        padding[mod] = 0x80;
      }
    } else {
      padding[0] = 0x80;
    }
    function blk(A, i, hash) {
      /*jslint bitwise: true */
      var a = hash[0], b = hash[1], c = hash[2], d =  hash[3], f = 0, g = 0, tmp = 0;
      M[0] = A[i] + A[i + 1] * 0x100 + A[i + 2] * 0x10000 + A[i + 3] * 0x1000000;
      i += 4;
      while (i % 64) {
        M[(i % 64) / 4] = A[i] + A[i + 1] * 0x100 + A[i + 2] * 0x10000 + A[i + 3] * 0x1000000;
        i += 4;
      }
      i = 0;
      while (i < 64) {
        if (i < 16) {
          f = (b & c) | ((~b) & d);
          g = i;
        } else if (i < 32) {
          f = (d & b) | ((~d) & c);
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          f = b ^ c ^ d;
          g = (3 * i + 5) % 16;
        } else {
          f = c ^ (b | (~d));
          g = (7 * i) % 16;
        }
        tmp = d;
        d = c;
        c = b;
        b = b + leftrotate((a + f + K[i] + M[g]), s[i]);
        a = tmp;
        i += 1;
      }
      hash[0] = hash[0] + a;
      hash[1] = hash[1] + b;
      hash[2] = hash[2] + c;
      hash[3] = hash[3] + d;
    }
    mod = 0;
    while (mod < bl) {
      blk(message, mod, hash);
      mod += 64;
    }
    if (padding2) { blk(padding2, 0, hash); }
    blk(padding, 0, hash);
    return hash.buffer;
  }
  env.md5sumArrayBuffer = md5sumArrayBuffer;

  //if ((tmp = ab2hex(env.md5sumArrayBuffer(bs2ab("The quick brown fox jumps over the lazy dog")))) !== "9e107d9d372bb6826bd81d3542a419d6") { alert(tmp); }
  //if ((tmp = ab2hex(env.md5sumArrayBuffer(bs2ab("The quick brown fox jumps over the lazy dog.")))) !== "e4d909c290d0fb1ca068ffaddf22cbd0") { alert(tmp); }
  //if ((tmp = ab2hex(env.md5sumArrayBuffer(bs2ab("The quick brown fox jumps over the lazy black and white dog.")))) !== "a62edd3f024b98a4f6fce7afb7f066eb") { alert(tmp); }
  //if ((tmp = ab2hex(env.md5sumArrayBuffer(bs2ab("")))) !== "d41d8cd98f00b204e9800998ecf8427e") { alert(tmp); }

  ///////////////
  // Shortcuts //
  ///////////////

  env.btoa = env.encodeBinaryStringToBase64;
  env.atob = env.decodeBase64ToBinaryString;
  env.seq = env.Task.sequence;

  //////////////////////////////////////////////////////////////////////

  return env;
}(this));
