/* Namespace.js

   Version 2.0, May 11, 2010
   by Mike Koss - released into the public domain.

   Support for building modular namespaces in javascript.

   Globals:

   namespace - The top of the namespace hierarchy. Child
   namespaces are stored as properties in each namespace object.

   namespace.lookup(path) - Return the namespace object with the given
   path. Creates the namespace if it does not already exist. The path
   has the form ('unique.module.sub_module').

   Utility functions:

   util = namespace.util;

   util.extendObject(dest, source1, source2, ...) - Copy the properties
   from the sources into the destination (properties in following objects
   override those from the preceding objects).

   util.copyArray(a) - makes a (shallow) copy of an array or arguments list
   and returns an Array object.

   Extensions to the Function object:

   Class.methods({
   f1: function () {...},
   f2: function () {...}
   ));

   f1.fnMethod(obj, args) - closure to call obj.f1(args);

   f1.fnArgs(args) - closure to add more arguments to a function

   *** Class Namespace ***

   Methods:

   ns.define(callback(ns)) - Call the provided function with the new
   namespace as a parameter. Returns the newly defined namespace.

   ns.defineOnce(callback(ns)) - Same as 'define', but only allows the
   first invocation of the callback function.

   ns.extend(object) - Copy the (own) properties of the source
   object into the namespace.

   ns.nameOf(symbol) - Return the global name of a symbol in a namespace
   (for eval() or html onEvent attributes).

   Usage example:

   namespace.lookup('org.startpad.base').define(function(ns) {
       var util = namespace.util;
       var other = ns.lookup('org.startpad.other');

       ns.extend({
           var1: value1,
           var2: value2,
           myFunc: function(args) {
               ...other.aFunction(args)...
           }
       });

       // Constructor
       ns.ClassName = function(args) {
           ...
       };

       util.extendObject(ns.ClassName.prototype, {
           var1: value1,

           method1: function(args) {
           }
       });
   });
*/

// Define stubs for FireBug objects if not present.
// This is here because this will often be the first javascript file loaded.
// We refrain from using the window object as we may be in a web worker where
// the global scope is NOT window.
if (typeof console == 'undefined') {
    var console = (function() {
        if (console != undefined) {
            return console;
        }
        var noop = function() {};
        var names = ["log", "debug", "info", "warn", "error", "assert",
                     "dir", "dirxml", "group", "groupEnd", "time", "timeEnd",
                     "count", "trace", "profile", "profileEnd"];
        var consoleT = {};
        for (var i = 0; i < names.length; ++i) {
            consoleT[names[i]] = noop;
        }
        return consoleT;
    }());
}

var namespace = (function() {
    try {
        if (namespace != undefined) {
            return namespace;
        }
    }
    catch (e) {}

    function Namespace(parent, name) {
        if (name) {
            name = name.replace(/-/g, '_');
        }
        this._isDefined = false;
        // List of namespaces that were referenced during definition.
        this._referenced = [];
        this._parent = parent;
        if (this._parent) {
            this._parent[name] = this;
            this._path = this._parent._path;
            if (this._path !== '') {
                this._path += '.';
            }
            this._path += name;
        } else {
            this._path = '';
        }
    }

    var namespaceT = new Namespace(null);

    // Extend an object's properties from one (or more) additional
    // objects.
    function extendObject(dest, args) {
        if (dest === undefined) {
            dest = {};
        }
        for (var i = 1; i < arguments.length; i++) {
            var source = arguments[i];
            for (var prop in source) {
                if (source.hasOwnProperty(prop)) {
                    dest[prop] = source[prop];
                }
            }
        }
        return dest;
    }

    // Useful for converting arguments to an regular array
    function copyArray(arg) {
        return Array.prototype.slice.call(arg, 0);
    }

    // Inspired by JavaScript: The Good Parts, p33.
    // Usage:
    // Class.methods({
    // f1: function() {...},
    // f2: function() {...}
    // });
    Function.prototype.methods = function (obj) {
        extendObject(this.prototype, obj);
    };

    Function.methods({
        // Closure for a method call - like protoype.bind()
        fnMethod: function (obj) {
            var _fn = this;
            return function() {
                return _fn.apply(obj, arguments);
            };
        },

        // Closure with appended parameters to the function call.
        fnArgs: function () {
            var _fn = this;
            var _args = copyArray(arguments);

            return function() {
                var args = copyArray(arguments).concat(_args);
                // REVIEW: Is this intermediate self variable needed?
                var self = this;
                return _fn.apply(self, args);
            };
        }
    });

    // Functions added to every Namespace.
    Namespace.methods({
        // Call a function with the namespace as a parameter - forming
        // a closure for the namespace definition.
        define: function(callback) {
            this._isDefined = true;
            console.info("Namespace '" + this._path + "' defined.");
            if (callback) {
                Namespace.defining = this;
                callback(this);
                Namespace.defining = undefined;
            }
            return this;
        },

        // Same as define, but will not execute the callback more than once.
        defineOnce: function(callback) {
            // In case a namespace is multiply loaded, we ignore the
            // definition function for all but the first call.
            if (this._isDefined) {
                console.warn("Namespace '" + this._path + "' redefinition.");
                return this;
            }
            return this.define(callback);
        },

        // Extend the namespace from the arguments of this function.
        extend: function() {
            // Use the Array.slice function to convert arguments to a
            // real array.
            var args = [this].concat(copyArray(arguments));
            return extendObject.apply(undefined, args);
        },

        // Return a global name for a namespace symbol (for eval()
        // or use in onEvent html attributes.
        nameOf: function(symbol) {
            symbol = symbol.replace(/-/g, '_');
            return 'namespace.' + this._path + '.' + symbol;
        }
    });

    extendObject(namespaceT, {
        // Lookup a global namespace object, creating it (and it's parents)
        // as necessary.  If a namespace is currently being defined,
        // add any looked up references to the namespace (if lookup is not
        // used, _referenced will not be complete.
        lookup: function(path) {
            var fCreated = false;
            path = path.replace(/-/g, '_');
            var parts = path.split('.');
            var cur = namespaceT;
            for (var i = 0; i < parts.length; i++) {
                var name = parts[i];
                if (cur[name] === undefined) {
                    cur = new Namespace(cur, name);
                    fCreated = true;
                }
                else {
                    cur = cur[name];
                }
            }
            if (Namespace.defining) {
                Namespace.defining._referenced.push(cur);
                if (fCreated) {
                    console.warn("Forward reference from " +
                                 Namespace.defining._path + " to " +
                                 path + ".");
                }
            }
            return cur;
        }
    });

    // Put utilities in the 'util' namespace beneath the root.
    namespaceT.lookup('util').extend({
        extendObject: extendObject,
        copyArray: copyArray
    }).defineOnce();

    return namespaceT;
}());
