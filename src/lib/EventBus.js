(function (undefined) {
  'use strict';

  var g = this,
      nativeForEach = Array.prototype.forEach,
      nativeIsArray = Array.isArray,
      slice = Array.prototype.slice,
      isArray,
      version = '0.1';

  isArray = nativeIsArray || function(obj) {
    return Object.prototype.call(obj) === '[object Array]';
  };

  function each(obj, iterator, context) {
    var i, l, key;
    if (obj == null) {
      return;
    } 
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (i = 0, l = obj.length; i < l; i++) {
        if (i in obj) {
          iterator.call(context, obj[i], i, obj);
        }      
      }
    } else {
      for (key in obj) {
        if (obj.hasOwnProperty(key)) {
          iterator.call(context, obj[key], key, obj);
        }
      }
    }
  }

  function extend(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        obj[prop] = source[prop];
      }
    });
    return obj;
  }

  function EventBus(options) {
    //make sure we are called with new!
    if(!(this instanceof EventBus)) {
      return new EventBus(options);  
    }
    this.options = extend({
      maxListeners: 10  
    }, options); 
    this.topics = {};
    this.subscriptions = {
      all:[]
    };
    this._maxListeners = this.options.maxListeners;
  }

  EventBus.prototype = {
    addListener: function (topic, fn, context) {
       var subs = null;
       if(typeof fn === 'function') {
        subs = this.subscriptions[topic] || [];

        subs.push({
          topic: topic,
          fn: fn,
          context: context
        });

        this.subscriptions[topic] = subs;
        return [topic, fn, context];
      } 
    },
    emit: function() {
      var topic = arguments[0], 
          subs = this.subscriptions[topic],
          sub = null,
          all = this.subscriptions.all,
          args = Array.prototype.slice.call(arguments);

      if(subs != null) {
        subs = subs.slice();  
        while(sub = subs.shift()) {
          sub.fn.apply(sub.context || {}, args.slice(1, args.length));
        }
      }  
      all = all.slice();
      while(sub = all.shift()) {
        sub.fn.apply(sub.context || {}, args);
      }
    },
    removeListener: function(topic, fn, context) {
      var idx = null,
          subs = null,
          rmvIdx = null, 
          listener;

      if(isArray(topic)) {
        subs = this.subscriptions[topic[0]];
        fn = topic[1];
        context = topic[2];
      } else {
        subs = this.subscriptions[topic];
      }

      if(subs) {
        for (idx = 0; idx < subs.length; idx++) {
          listener = subs[idx];
          if(listener.fn === fn && listener.context === context) {
            rmvIdx = idx;
            idx = subs.length;
          }
        }
      }

      if (rmvIdx !== null) {
        subs.splice(rmvIdx, 1);
      }

      if(subs.length === 0) {
        delete this.subscriptions[topic];  
      }

      return this;
    },
    removeAllListeners: function(topic) {
      if(topic == null) {
        this.subscriptions = {
          all:[]
        };
      } else {
        delete this.subscriptions[topic];
      }
      return this;
    },
    once: function (topic, fn, context) {
      var me = this;

      function listener() {
        me.removeListener(topic,listener,context);
        fn.apply(context || {}, arguments);
      }

      this.addListener(topic, listener, context);
      return [topic, listener, context];
    },
    setMaxListeners: function(max) {
      this._maxListeners = max;
    },
    listeners: function(topic) {
      return this.subscriptions[topic];  
    }
  };

  /*
   * # Alias Functions
   *
   */
  EventBus.version = version;
  EventBus.prototype.publish = EventBus.prototype.emit;
  EventBus.prototype.subscribe = EventBus.prototype.addListener; 
  EventBus.prototype.unsubscribe = EventBus.prototype.removeListener;

  /* 
   * # Decorators
   *
   */
  EventBus.decorators = {
    /*
     * Add pubsub functionality to any object.
     *
     * ## PubSub
     *
     * Add EventBus functions to any object.
     *
     * Adds the following
     *
     * * `publish`: publish information on a topic
     * * `subscribe`: subscribe to events published on a topic
     * * `unsubscribe`: unsubscribe from a topic
     */
    pubsub : function(obj, options) {
      var evtBus = new EventBus(options);
      return extend(obj, {
        publish: function() {
          return evtBus.emit.apply(evtBus, arguments);
        },
        subscribe: function() {
          return evtBus.addListener.apply(evtBus, arguments);
        },
        unsubscribe: function() {
          return evtBus.removeListener.apply(evtBus, arguments);  
        }
      });
    },
    /*
     * ## Observable
     *
     * Add the ability to be notified when the attribute of your object changes.
     *
     * Adds the following
     *
     * * `get`: used to access properties of your observable
     * * `set`: used to set properties of your observable
     * * `any`: get notified of any change on the object
     * * `subscribe`: used to subscribe to changes on the observable
     * * `unsubscribe`: used to unsubscribe to changes on the observable
     */
    observable: function(obj, options) {
      var evtBus = new EventBus(options);
      return extend(obj, {
        set: function(key, val) {
          var previous = this[key];
          this[key] = val;
          evtBus.publish(key, previous, val);
        },
        get: function( key ) {
          evtBus.publish(key, obj[key]);
          return obj[key];
        },
        subscribe: function () {
          return evtBus.addListener.apply(evtBus, arguments);
        },
        unsubscribe: function() {
          return evtBus.removeListener.apply(evtBus, arguments);
        },
        change: function() {
          var args = Array.prototype.slice.call(arguments);
          args.unshift('all');
          return evtBus.addListener.apply(evtBus, args);
        }
      });
    }
  };

  /*
   * # Detect Environment
   * 
   * EventBusJS can run in many different JavaScript Environments. Below we are
   * tyring to detect the environment and expose the EventBus object properly.
   *
   */

  if ('module' in g && g.module != null && g.module.exports) {
    //Node
    g.module.exports = EventBus; 
  } else if ('define' in g && g.define != null && g.define.amd) {
    //AMD
    g.define([], function() {
      return EventBus;  
    });  
  } else {
    //Browser  
    var oldEvtBus = g.EventBus;
    EventBus.noConflict = function() {
      g.EventBus = g.oldEvtBus;
      return EventBus;
    };
    g.EventBus = EventBus;
  }

}.call(this));

