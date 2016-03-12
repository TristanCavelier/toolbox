/*jslint indent: 2 */
(function (env) {
  "use strict";

  /*! Copyright (c) 2015-2016 Tristan Cavelier <t.cavelier@free.fr>
      This program is free software. It comes without any warranty, to
      the extent permitted by applicable law. You can redistribute it
      and/or modify it under the terms of the Do What The Fuck You Want
      To Public License, Version 2, as published by Sam Hocevar. See
      http://www.wtfpl.net/ for more details. */

  /*jslint vars: true */
  var log = console.log.bind(console);
  var warn = console.warn.bind(console);
  function test(name, taskFn, timeout) {
    return env.Task.raceWinOrCancel([
      env.task(taskFn),
      env.Task.sequence([env.sleep.bind(null, timeout || 1000), function () { throw new Error("test timeout (" + name + ")"); }])
    ]).catch(function (v) {
      warn(name);
      warn(v);
    });
  }

  //////////////////////////////////////////////
  // Channel tests
  test("'next' gets sent value", function* () {
    var chan = env.newChannel(), t1 = chan.send("test1 coucou"), v;
    v = yield chan.next();
    if (v.value !== "test1 coucou") { throw "wrong value"; }
    yield t1;
  });
  test("same with buffered channel", function* () {
    var chan = env.newChannel(1), v;
    yield chan.send("test3 coucou");
    v = yield chan.next();
    if (v.value !== "test3 coucou") { throw "wrong value"; }
  });
  test("'next' can be cancelled without blocking another 'next' call", function* () {
    var chan = env.newChannel(), nexting, nexting2, v;
    nexting = chan.next();
    nexting2 = chan.next();
    nexting.catch(function () { return; });
    nexting.cancel();
    yield;
    yield chan.send("yeah");
    v = yield nexting2;
    if (v.value !== "yeah") { throw "cancelled next still blocks anther next"; }
  });
  test("'send' sends to waiting next", function* () {
    var chan = env.newChannel(), t1, v;
    t1 = chan.next();
    yield chan.send("test2 coucou");
    v = yield t1;
    if (v.value !== "test2 coucou") { throw "wrong value"; }
  });
  test("'close' a channel during waiting next", function* () {
    var chan = env.newChannel(), v;
    env.sleep(100).then(chan.close.bind(chan));
    v = yield chan.next();
    if (v.done !== true) { throw "wrong value"; }
  });
  test("'Channel.select' gets first responding next", function* () {
    var chan = env.newChannel(), chan2 = env.newChannel(), v;
    env.sleep(100).then(chan.send.bind(chan, "test5 coucou"));
    env.sleep(500).then(chan2.send.bind(chan2, "test5 hello"));
    v = yield env.Channel.select([
      [chan2, function () { warn("should not happen"); }],
      [chan, function (v) { return v.value; }]
    ]);
    if (v !== "test5 coucou") { throw "wrong value"; }
  });
  test("'Channel.select' gets run default if no next are available now", function* () {
    var chan = env.newChannel(), chan2 = env.newChannel(), v;
    env.sleep(100).then(chan.send.bind(chan, "test6 coucou"));
    env.sleep(500).then(chan2.send.bind(chan2, "test6 hello"));
    v = yield env.Channel.select([
      [chan2, function () { warn("should not happen"); }],
      [chan, function (v) { return v; }],
      function () { return "default"; }
    ]);
    if (v !== "default") { throw "wrong value"; }
  });
  test("'Channel.select' gets run available not default", function* () {
    var chan = env.newChannel(), chan2 = env.newChannel(), v;
    chan.send("test coucou")
    env.sleep(500).then(chan2.send.bind(chan2, "test hello"));
    v = yield env.Channel.select([
      [chan2, function () { warn("should not happen"); }],
      [chan, function (v) { return v.value; }],
      function () { return "default"; }
    ]);
    if (v !== "test coucou") { throw "wrong value"; }
  });
  test("'Channel.select' cancels next before calling callback", function* () {
    var chan = env.newChannel(), chan2 = env.newChannel(), v;
    env.sleep(100).then(chan.send.bind(chan, "test7 coucou")).then(null, warn.bind("should not happen"));
    env.sleep(500).then(chan2.send.bind(chan2, "test7 hello")).then(warn.bind(null, "should not happen"), warn.bind("should not happen"));
    v = yield env.Channel.select([
      [chan2, function () { warn("should not happen"); }],
      [chan, function (v) {
        return env.sleep(600).then(function () { return v.value; });
      }]
    ]);
    if (v !== "test7 coucou") { throw "wrong value"; }
  });

}(env));
