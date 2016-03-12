/*jslint indent: 2 */
(function envExporter(exportRoot, exportKey) {
  "use strict";

  /*! Copyright (c) 2015-2016 Tristan Cavelier <t.cavelier@free.fr>
      This program is free software. It comes without any warranty, to
      the extent permitted by applicable law. You can redistribute it
      and/or modify it under the terms of the Do What The Fuck You Want
      To Public License, Version 2, as published by Sam Hocevar. See
      http://www.wtfpl.net/ for more details. */

  var env = {}, registeredLib = [];
  if (typeof exportKey !== "string") { exportKey = "env"; }
  if (typeof exportRoot === "object" && exportRoot !== null) { exportRoot[exportKey] = env; }

  env.registerLib = function (lib) {
    if (typeof lib !== "function") { throw new Error("lib is not a function"); }
    registeredLib.push(lib);
  };
  env.getRegisteredLib = function () { return registeredLib.slice(); };
  env.toScript = function () {
    var i, l = registeredLib.length, a = new Array(l + 1);
    a[0] = "(" + envExporter.toString() + "(this));"
    for (i = 0; i < l; i += 1) {
      a[i + 1] = "(" + registeredLib[i].toString() + "(env));"
    }
    return a.join("\n") + "\n";
  };
  env.copyEnv = function () {
    var newEnv = envExporter(), l = registeredLib.length, i;
    for (i = 0; i < l; i += 1) { registeredLib[i](newEnv); }
    return newEnv;
  };
  env.newEnv = function () { return envExporter(); };

  return env;

}(this));
