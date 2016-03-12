/*jslint indent: 2 */
(function envChannels(env) {
  "use strict";

  /*! Copyright (c) 2015-2016 Tristan Cavelier <t.cavelier@free.fr>
      This program is free software. It comes without any warranty, to
      the extent permitted by applicable law. You can redistribute it
      and/or modify it under the terms of the Do What The Fuck You Want
      To Public License, Version 2, as published by Sam Hocevar. See
      http://www.wtfpl.net/ for more details. */

  // dependencies: env.Promise, env.newPromise, env.Task
  // provides: env.{,new}Channel
  // - A Channel is like a `chan` in go.

  var wm = typeof WeakMap === "function" ? new WeakMap() : {get: function (a) { return a; }, set: function () { return; }};

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
    wm.set(this, {});
    var chan = wm.get(this);
    if (capacity > 0) { chan["[[ChannelCapacity]]"] = capacity; }
  }
  var CLOSED_ERROR = Channel.CLOSED_ERROR = Channel.prototype.CLOSED_ERROR = new Error("closed channel");
  Channel.prototype.getLength = function () { return wm.get(this)["[[Channel:send:length]]"] || 0; };
  Channel.prototype.getCapacity = function () { return wm.get(this)["[[ChannelCapacity]]"] || 0; };
  Channel.prototype.close = function () {
    /*jslint ass: true */
    var chan = wm.get(this), next;
    chan["[[ChannelError]]"] = CLOSED_ERROR;  // use Channel.CLOSED_ERROR ?
    while (chan["[[Channel:next:length]]"] > 0) {
      next = channelFifoPop(chan, "next");
      if (next && !next.done) { return next.resolve({done: true}); }
    }
  };
  Channel.prototype.throw = function (e) {
    /*jslint ass: true */
    var chan = wm.get(this), next;
    chan["[[ChannelError]]"] = e;
    while (chan["[[Channel:next:length]]"] > 0) {
      next = channelFifoPop(chan, "next");
      if (next && !next.done) { return next.reject(e); }
    }
  };
  Channel.prototype.send = function (v) {
    /*jslint plusplus: true, ass: true */
    var chan = wm.get(this), next, send;
    if (chan["[[ChannelError]]"]) { return env.Promise.reject(chan["[[ChannelError]]"]); }
    while (chan["[[Channel:next:length]]"] > 0) {
      next = channelFifoPop(chan, "next");
      if (next && !next.done) { return next.resolve({value: v}); }
    }
    send = channelFifoPush(chan, "send", v);
    if (chan["[[Channel:send:length]]"] <= chan["[[ChannelCapacity]]"]) { send.resolve(); }  // XXX dont return ?
    return send.promise;
  };
  Channel.prototype.next = function () {
    /*jslint plusplus: true, ass: true */
    var chan = wm.get(this), send;
    while (chan["[[Channel:send:length]]"] > 0) {
      send = channelFifoPop(chan, "send");
      if (send && !send.done) {
        send.resolve();
        return env.Promise.resolve({value: send.value});  // XXX dont return {value: value} directly ?
      }
    }
    if (chan["[[ChannelError]]"]) {
      if (chan["[[ChannelError]]"] === CLOSED_ERROR) {  // use Channel.CLOSED_ERROR ?
        return env.Promise.resolve({done: true});  // XXX dont return {done: true} directly ?
      }
      return env.Promise.reject(chan["[[ChannelError]]"]);
    }
    return channelFifoPush(chan, "next").promise;
  };
  Channel.select = function (cases) {
    // `select` blocks until one of its cases can run, then it executes that case.
    // The default case in a select is run if no other case is ready.
    //
    //     return Channel.select([
    //       [chan1, function (v) { return v.value; }],  // case 1
    //       [chan2, function (v) { return v.value; }],  // case 2
    //       function () { return "default"; }           // default case
    //     ]);

    // API stability level: 1 - Experimental
    var i, l = cases.length, p = new Array(l), s = new Array(l), never;
    function ret(v) { return v; }
    function solve(fn, v) {
      if (never) { return never; }
      never = env.newPromise(ret);
      return fn(v);
    }
    function reject(r) {
      if (never) { return never; }
      never = env.newPromise(ret);
      return env.Promise.reject(r);
    }
    for (i = 0; i < l; i += 1) {
      if (typeof cases[i] === "function") {
        p[i] = env.Promise.resolve();
        s[i] = env.Task.sequence([ret.bind(null, p[i]), [solve.bind(null, cases[i]), reject]]);
      } else {
        p[i] = cases[i][0].next();
        s[i] = env.Task.sequence([ret.bind(null, p[i]), [solve.bind(null, cases[i][1]), reject]]);
      }
    }
    env.Task.raceWinOrCancel(p);
    return env.Task.race(s);
  };

  env.registerLib(envChannels);
  env.Channel = Channel;
  env.newChannel = function () { var c = env.Channel, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

}(env));
