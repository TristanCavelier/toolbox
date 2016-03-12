/*jslint indent: 2 */
(function envEventManagers(env) {
  "use strict";

  /*! Copyright (c) 2015-2016 Tristan Cavelier <t.cavelier@free.fr>
      This program is free software. It comes without any warranty, to
      the extent permitted by applicable law. You can redistribute it
      and/or modify it under the terms of the Do What The Fuck You Want
      To Public License, Version 2, as published by Sam Hocevar. See
      http://www.wtfpl.net/ for more details. */

  // provides: env.{,new}EventManager
  // - Force to have private listeners like in html5 EventTarget objects.
  // - `dispatchEvent` is synchronous function, but it can be called like this: `setTimeout(em.dispatchEvent.bind(em), 0, event);`

  var wm = typeof WeakMap === "function" ? new WeakMap() : {get: function (a) { return a; }, set: function () { return; }};

  function priv(o) {
    var tmp = wm.get(o);
    if (tmp) { return tmp; }
    wm.set(o, {});
    return wm.get(o);
  }

  function EventManager() {
    // can be mixed in with:
    //     env.mixObjectProperties(Constructor.prototype, EventManager.prototype);

    // API stability level: 1 - Experimental
    return;
  }
  EventManager.prototype.addEventListener = function (type, listener) {
    if (typeof listener !== "function") { return; }
    var em = priv(this), key = "[[EventManagerListeners:" + type + "]]";
    if (em[key]) {
      em[key].push(listener);
    } else {
      em[key] = [listener];
    }
  };
  EventManager.prototype.removeEventListener = function (type, listener) {
    /*jslint plusplus: true */
    var em = priv(this), key = "[[EventManagerListeners:" + type + "]]", listeners = em[key] || [], i, l = listeners.length;
    for (i = 0; i < l; i += 1) {
      if (listeners[i] === listener) {
        if (l === 1) {
          delete em[key];
          return;
        }
        while (i < l) { listeners[i] = listeners[++i]; }
        listeners.length -= 1;
        return;
      }
    }
  };
  EventManager.prototype.dispatchEvent = function (event) {
    var em = priv(this), key = "[[EventManagerListeners:" + event.type + "]]", key2 = "on" + event.type, listeners = em[key] || [], i, l = listeners.length;
    if (typeof this[key2] === "function") {
      try { this[key2](event); } catch (ignore) {}
    }
    for (i = 0; i < l; i += 1) {
      try { listeners[i](event); } catch (ignore) {}
    }
  };

  env.registerLib(envEventManagers);
  env.EventManager = EventManager;
  env.newEventManager = function () { var c = env.EventManager, o = Object.create(c.prototype); c.apply(o, arguments); return o; };

}(env));
