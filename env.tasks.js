/*jslint indent: 2 */
(function envTasks(env) {
  "use strict";

  /*! Copyright (c) 2015-2016 Tristan Cavelier <t.cavelier@free.fr>
      This program is free software. It comes without any warranty, to
      the extent permitted by applicable law. You can redistribute it
      and/or modify it under the terms of the Do What The Fuck You Want
      To Public License, Version 2, as published by Sam Hocevar. See
      http://www.wtfpl.net/ for more details. */

  // dependencies: env.Promise, env.newPromise, env.newDeferred
  // provides: env.{,new}Task, env.{,new}TaskThen, env.task

  var wm = typeof WeakMap === "function" ? new WeakMap() : {get: function (a) { return a; }, set: function () { return; }};

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
      var d = env.newDeferred(), g = generatorFunction.call(env.newInTaskController(d));
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
  TaskThen.prototype = Object.create(Task.prototype);

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

  env.registerLib(envTasks);
  env.InTaskController = InTaskController;
  env.newInTaskController = function () { var c = env.InTaskController, o = Object.create(c.prototype); c.apply(o, arguments); return o; };
  env.Task = Task;
  env.newTask = function () { var c = env.Task, o = Object.create(c.prototype); c.apply(o, arguments); return o; };
  env.TaskThen = TaskThen;
  env.newTaskThen = function () { var c = env.TaskThen, o = Object.create(c.prototype); c.apply(o, arguments); return o; };
  env.task = env.newTask.bind(null);
  env.task.seq = Task.sequence.bind(null);

}(env));
