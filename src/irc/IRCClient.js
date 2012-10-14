define(['irc/codes', 
        'underscore'], 
        function(codes, _) {

    'use strict';

    var noop = function() {};

    var messageHandlers = {
      '001': function(message, client) {
        // Set nick to whatever the server decided it really is
        // (normally this is because you chose something too long and
        // the server has shortened it
        client.nick = message.args[0];
        client.emit('registered', message);
      }, 
      '005': function(message, client) {
        message.args.forEach(function(arg) {
            var match = arg.match(/PREFIX=\((.*?)\)(.*)/);
            if ( match ) {
                match[1] = match[1].split('');
                match[2] = match[2].split('');
                while ( match[1].length ) {
                    client.modeForPrefix[match[2][0]] = match[1][0];
                    client.prefixForMode[match[1].shift()] = match[2].shift();
                }
            }
        });
      },
      '329': function(message, client) {
        var channel = client.chanData(message.args[1]);
        if ( channel ) {
          channel.created = message.args[2];
        }
      },
      '330': function(message, client) {
        client._addWhoisData(message.args[1], 'account', message.args[2]);
        client._addWhoisData(message.args[1], 'accountinfo', message.args[3]);
      },
      '333': function(message, client) {
        var channel = client.chanData(message.args[1]);
        if ( channel ) {
          channel.topicBy = message.args[2];
          // channel, topic, nick
          client.emit('topic', message.args[1], channel.topic, channel.topicBy, message);
        }
      },
      'error_nicknameinuse': function(message, client) {
        if ( client.opt.nickMod == null ) {
            client.opt.nickMod = 0;

        }

        client.opt.nickMod++;
        client.send("NICK", client.opt.nick + client.opt.nickMod);
        client.nick = client.opt.nick + client.opt.nickMod;
      },
      'PING': function(message, client) {
        client.send("PONG", message.args[0]);
      },
      'NOTICE': function(message, client) {
        var from = message.nick;
        var to   = message.args[0] || null;
        var text = message.args[1];
        
        if (text[0] === '\\1' && text.lastIndexOf('\\1') > 0) {
            client._handleCTCP(from, to, text, 'notice');
        } else {
          client.emit('notice', from, to, text, message);
          if(to === client.nick) {
            client.log('GOT NOTICE from '+(from?'"'+from+'"':'the server')+': "'+text+'"');  
          }
        }
      },
      'MODE': function(message, client) {
        var channel = client.chanData(message.args[0]);
        var modeList = message.args[1].split('');
        var adding = true;
        var modeArgs = message.args.splice(2);
        
        client.log("MODE:"+message.args[0]+" sets mode: "+message.args[1]);

        if ( channel == null ) {
          return;
        }
        modeList.forEach(function(mode) {
          if ( mode === '+' ) { 
            adding = true; 
            return; 
          }

          if ( mode === '-' ) { 
            adding = false; 
            return; 
          }
          
          if ( mode in client.prefixForMode ) {
            // user modes
            var user = modeArgs.shift();
            if ( adding ) {
              if ( channel.users[user].indexOf(client.prefixForMode[mode]) === -1 ) {
                channel.users[user] += client.prefixForMode[mode];
              }

              client.emit('+mode', message.args[0], message.nick, mode, user, message);
            } else {
              channel.users[user] = channel.users[user].replace(client.prefixForMode[mode], '');
              client.emit('-mode', message.args[0], message.nick, mode, user, message);
            }
          } else {
            var modeArg;
            // channel modes
            if ( mode.match(/^[bkl]$/) ) {
              modeArg = modeArgs.shift();
              if ( modeArg.length === 0 ) {
                modeArg = undefined;
              }

            }
              // TODO - deal nicely with channel modes that take args
              if ( adding ) {
                if ( channel.mode.indexOf(mode) === -1 ) {
                  channel.mode += mode;
                }
                client.emit('+mode', message.args[0], message.nick, mode, modeArg, message);
              }
              else {
                channel.mode = channel.mode.replace(mode, '');
                client.emit('-mode', message.args[0], message.nick, mode, modeArg, message);
              }
          }
        });
      },
      'NICK': function(message, client) {
        
        var channels = [];
        var channame = null;
        var channel = null;
        
        if ( client.opt.debug ) {
          client.log("NICK: " + message.nick + " changes nick to " + message.args[0]);
        }

        // TODO better way of finding what channels a user is in?
        for ( channame in client.chans ) {
          channel = client.chans[channame];
          if ( 'string' === typeof channel.users[message.nick] ) {
            channel.users[message.args[0]] = channel.users[message.nick];
            delete channel.users[message.nick];
            channels.push(channame);
          }
        }

        // old nick, new nick, channels
        client.emit('nick', message.nick, message.args[0], channels, message);
      },
      'TOPIC': function(message, client) {
        // channel, topic, nick
        var channel = client.chanData(message.args[0]);
        client.emit('topic', message.args[0], message.args[1], message.nick, message);

        if ( channel ) {
          channel.topic = message.args[1];
          channel.topicBy = message.nick;
        }
      },
      'JOIN': function(message, client) {
        var channel = null;
        if ( client.nick === message.nick ) {
          client.chanData(message.args[0], true);
        }
        else {
          channel = client.chanData(message.args[0]);
          channel.users[message.nick] = '';
        }
        client.emit('join', message.args[0], message.nick, message);
        client.emit('join' + message.args[0], message.nick, message);
        if ( message.args[0] !== message.args[0].toLowerCase() ) {
          client.emit('join' + message.args[0].toLowerCase(), message.nick, message);
        }
      },
      'PART': function(message, client) {
        var channel = null;
        // channel, who, reason
        client.emit('part', message.args[0], message.nick, message.args[1], message);
        client.emit('part' + message.args[0], message.nick, message.args[1], message);
        if ( message.args[0] !== message.args[0].toLowerCase() ) {
          client.emit('part' + message.args[0].toLowerCase(), message.nick, message.args[1], message);
        }
        if ( client.nick === message.nick ) {
            channel = client.chanData(message.args[0]);
            delete client.chans[channel.key];
        }
        else {
            channel = client.chanData(message.args[0]);
            delete channel.users[message.nick];
        }
      },
      'KICK': function(message, client) {
        var channel = null;
        // channel, who, by, reason
        client.emit('kick', message.args[0], message.args[1], message.nick, message.args[2], message);
        client.emit('kick' + message.args[0], message.args[1], message.nick, message.args[2], message);
        if ( message.args[0] !== message.args[0].toLowerCase() ) {
            client.emit('kick' + message.args[0].toLowerCase(), message.args[1], message.nick, message.args[2], message);
        }

        if ( client.nick === message.args[1] ) {
            channel = client.chanData(message.args[0]);
            delete client.chans[channel.key];
        }
        else {
            channel = client.chanData(message.args[0]);
            delete channel.users[message.args[1]];
        }
      },
      'KILL': function(message, client) {
        var nick = message.args[0];
        var channels = [];
        var channel = null;
        for ( channel in client.chans ) {
          if ( client.chans[channel].users[nick] != null) {
            channels.push(channel);
          }

          delete client.chans[channel].users[nick];
        }
        client.emit('kill', nick, message.args[1], channels, message);
      },
      'PRIVMSG': function (message, client) {
        
        var from = message.nick;
        var to   = message.args[0];
        var text = message.args[1];
        if (text[0] === '\\1' && text.lastIndexOf('\\1') > 0) {
          client._handleCTCP(from, to, text, 'privmsg');
        } else {
          
          client.emit('message', from, to, text, message);
          if ( to.match(/^[&#]/) ) {
            client.emit('message#', from, to, text, message);
            client.emit('message' + to, from, text, message);
            if ( to !== to.toLowerCase() ) {
              client.emit('message' + to.toLowerCase(), from, text, message);
            }
          }
          if ( to === client.nick ) {
            client.emit('pm', from, text, message);
          }

          if ( client.opt.debug && to === client.nick ) {
            client.log('GOT MESSAGE from ' + from + ': ' + text);
          }
        }
      },
      'INVITE': function(message, client) {
        var from = message.nick;
        var to   = message.args[0];
        var channel = message.args[1];
        client.emit('invite', channel, from, message);
      },
      'QUIT': function(message, client) {
        var channels = [];
        var channel = null;
        var channame = null;
        client.log("QUIT: " + message.prefix + " " + message.args.join(" "));


        // TODO better way of finding what channels a user is in?
        for ( channame in client.chans ) {
          channel = client.chans[channame];
          if ( 'string' === typeof channel.users[message.nick] ) {
            delete channel.users[message.nick];
            channels.push(channame);
          }
        }

        // who, reason, channels
        client.emit('quit', message.nick, message.args[0], channels, message);
      },
      'rpl_motdstart': function (message, client) {
        client.motd = message.args[1] + "\n";
      },
      'rpl_motd': function (message, client) {
        client.motd += message.args[1] + "\n";
      },
      'rpl_endofmotd': this.err_nomotd,
      'rpl_namreply': function(message, client) {
        
        var channel = client.chanData(message.args[2]);
        var users = message.args[3].trim().split(/ +/);

        if ( channel ) {
          users.forEach(function (user) {
            var match = user.match(/^(.)(.*)$/);
            if ( match ) {
              if ( match[1] in client.modeForPrefix ) {
                  channel.users[match[2]] = match[1];
              }
              else {
                  channel.users[match[1] + match[2]] = '';
              }
            }
          });
        }
      },
      'rpl_endofnames': function(message, client) {
        var channel = client.chanData(message.args[1]);
        if ( channel ) {
          client.emit('names', message.args[1], channel.users);
          client.send('MODE', message.args[1]);
        }
      },
      'rpl_topic': function(message, client) {
        var channel = client.chanData(message.args[1]);
        if ( channel ) {
          channel.topic = message.args[2];
        }
      }, 
      'rpl_away': function(message, client) {
        client._addWhoisData(message.args[1], 'away', message.args[2], true);
      }, 
      'rpl_whoisuser': function(message, client) {
        client._addWhoisData(message.args[1], 'user', message.args[2]);
        client._addWhoisData(message.args[1], 'host', message.args[3]);
        client._addWhoisData(message.args[1], 'realname', message.args[5]);
      },
      'rpl_whoisidle': function(message, client) {
        client._addWhoisData(message.args[1], 'idle', message.args[2]);
      },
      'rpl_whoischannels': function(message, client) {
        client._addWhoisData(message.args[1], 'channels', message.args[2].trim().split(/\s+/)); // TODO - clean this up?
      },
      'rpl_whoisserver': function(message, client) {
        client._addWhoisData(message.args[1], 'server', message.args[2]);
        client._addWhoisData(message.args[1], 'serverinfo', message.args[3]);
      },
      'rpl_whoisoperator': function (message, client) {
        client._addWhoisData(message.args[1], 'operator', message.args[2]);
      },
      'rpl_endofwhois': function(message, client) {
        client.emit('whois', client._clearWhoisData(message.args[1]));
      },
      'rpl_liststart': function(message, client) {
        client.channellist = [];
        client.emit('channellist_start');
      },
      'rpl_list': function(message, client) {
        var channel = {
          name: message.args[1],
          users: message.args[2],
          topic: message.args[3],
        };
        client.emit('channellist_item', channel);
        client.channellist.push(channel);
      }, 
      'rpl_listend': function(message, client) {
        client.emit('channellist', client.channellist);
      },
      'rpl_channelmodeis': function(message, client) {
        var channel = client.chanData(message.args[1]);
        if ( channel ) {
          channel.mode = message.args[2];
        }
      },
      'err_nomotd': function (message, client) {
        client.motd += message.args[1] + "\n";
        client.emit('motd', client.motd);
      }
    };



    function Client(server, nick, net, tls, opt) {
      var self = this;
      var now = new Date().getTime();
      self.opt = {
        server: server,
        nick: nick,
        password: null,
        userName: 'unknown_'+now,
        realName: 'JS IRC client',
        port: 6667,
        debug: false,
        showErrors: false,
        autoRejoin: true,
        autoConnect: true,
        channels: [],
        retryCount: null,
        retryDelay: 2000,
        secure: false,
        selfSigned: false,
        certExpired: false,
        floodProtection: false,
        floodProtectionDelay: 1000,
        stripColors: false
      };

      self.opt = _.extend(self.opt, opt);

      this.net = net;
      this.tls = tls;
      this.conn = null;
      this.prefixForMode = {};
      this.modeForPrefix = {};
      this.chans = {};
      this._whoisData = {};

      if (self.opt.floodProtection) {
        self.activateFloodProtection();
      }


      if (self.opt.autoConnect === true) {
        self.connect();
      }

      self.addListener("raw", function (message) { // {{{
        var handler = messageHandlers[message.command];

        if(handler != null) {
          handler(message, self);  
        } 

        //log unknown messages
      });

      self.addListener('kick', function(channel, who, by, reason) {
        if ( self.opt.autoRejoin ) {
          self.send.apply(self, ['JOIN'].concat(channel.split(' ')));
        }
      });

      self.addListener('motd', function (motd) {
        self.opt.channels.forEach(function(channel) {
          self.send.apply(self, ['JOIN'].concat(channel.split(' ')));
        });
      });

    }

    Client.prototype.chanData = function( name, create ) {
      var key = name.toLowerCase();
      if ( create ) {
        this.chans[key] = this.chans[key] || {
          key: key,
          serverName: name,
          users: {},
          mode: ''
        };
      }

      return this.chans[key];
    };

    Client.prototype.secureConnect = function() {
      
      var creds = this.opt.secure;
      var me = this;
      if (typeof this.opt.secure !== 'object') {
        creds = {};
      }

      this.conn = this.tls.connect(this.opt.port, this.opt.server, creds, function() {
        // callback called only after successful socket connection
        me.conn.connected = true;
        if (me.conn.authorized ||
        (me.opt.selfSigned &&
         me.conn.authorizationError === 'DEPTH_ZERO_SELF_SIGNED_CERT') ||
        (me.opt.certExpired &&
         me.conn.authorizationError === 'CERT_HAS_EXPIRED')) {
            // authorization successful
          me.conn.setEncoding('utf-8');
          if ( me.opt.certExpired &&
          me.conn.authorizationError === 'CERT_HAS_EXPIRED' ) {
            me.log('Connecting to server with expired certificate');
          }
          if ( me.opt.password !==  null ) {
            me.send( "PASS", me.opt.password );
          }
          me.log('Sending irc NICK/USER');
          me.send("NICK", me.opt.nick);
          me.nick = me.opt.nick;
          me.send("USER", me.opt.userName, 8, "*", me.opt.realName);
          me.emit("connect");
        } else {
          // authorization failed
          me.log(me.conn.authorizationError);
        }
      });
      
    };

    Client.prototype.connect = function ( retryCount, callback ) { // {{{
      var me = this;
      var buffer = '';

      if ( typeof(retryCount) === 'function' ) {
        callback = retryCount;
        retryCount = undefined;
      }
      retryCount = retryCount || 0;
      if (typeof(callback) === 'function') {
        this.once('registered', callback);
      }
      this.chans = {};
        // try to connect to the server
      if (this.opt.secure) {
        this.secureConnect();
      } else {
        this.conn = this.net.createConnection(this.opt.port, this.opt.server);
      }
      this.conn.requestedDisconnect = false;
      this.conn.setTimeout(0);
      this.conn.setEncoding('utf8');
      this.conn.addListener("connect", function () {
        if ( me.opt.password !==  null ) {
          me.send( "PASS", me.opt.password );
        }
        me.send("NICK", me.opt.nick);
        me.nick = me.opt.nick;
        me.send("USER", me.opt.userName, 8, "*", me.opt.realName);
        me.emit("connect");
      });
      
      this.conn.addListener("data", function (chunk) {
        buffer += chunk;
        var lines = buffer.split("\r\n");
        buffer = lines.pop();
        lines.forEach(function (line) {
          var message = parseMessage(line, me.opt.stripColors);
          try {
            me.emit('raw', message);
          } catch ( err ) {
            if ( !me.conn.requestedDisconnect ) {
              throw err;
            }
          }
        });
        
      });
        
      this.conn.addListener("end", function() {
        me.log('Connection got "end" event');
        me.conn.addListener("close", function() {
          me.log('Connection got "close" event');
          if ( me.conn.requestedDisconnect ) {
            return;
          }
          me.log('Disconnected: reconnecting');
          if ( me.opt.retryCount !== null && retryCount >= me.opt.retryCount ) {
            me.log( 'Maximum retry count (' + me.opt.retryCount + ') reached. Aborting' );
            me.emit( 'abort', me.opt.retryCount );
            return;
          }

          me.log( 'Waiting ' + me.opt.retryDelay + 'ms before retrying' );
          setTimeout( function() {
            me.connect( retryCount + 1 );
          }, me.opt.retryDelay );
        });
        me.conn.addListener("error", function(exception) {
          me.emit("netError", exception);
        });
      });
    }; 

    Client.prototype.disconnect = function ( message, callback ) {
      if ( typeof message === 'function' ) {
        callback = message;
        message = undefined;
      }
      message = message || "chrome-irc says goodbye";
      if ( this.conn.readyState === 'open' ) {
        this.send( "QUIT", message );
      }
      this.conn.requestedDisconnect = true;
      if (typeof callback === 'function') {
        this.conn.once('end', callback);
      }
      this.conn.end();
    };

    Client.prototype.send = function(command) {
      var args = Array.prototype.slice.call(arguments);

      // Remove the command
      args.shift();

      if ( args[args.length-1].match(/\s/) ) {
        args[args.length-1] = ":" + args[args.length-1];
      }

      this.log('SEND: ' + command + " " + args.join(" "));

      if ( ! this.conn.requestedDisconnect ) {
        this.conn.write(command + " " + args.join(" ") + "\r\n");
      }
    };

    Client.prototype.activateFloodProtection = function(interval) { 

      var cmdQueue = [],
          safeInterval = interval || this.opt.floodProtectionDelay,
          origSend = this.send,
          me = this,
          dequeue;

      // Wrapper for the original function. Just put everything to on central
      // queue.
      this.send = function() {
        cmdQueue.push(arguments);
      };

      dequeue = function() {
        var args = cmdQueue.shift();
        if (args) {
          origSend.apply(me, args);
        }
      };

      // Slowly unpack the queue without flooding.
      setInterval(dequeue, safeInterval);
      dequeue();

    };

    Client.prototype.join = function(channel, callback) {
        this.once('join' + channel, function () {
          // if join is successful, add this channel to opts.channels
          // so that it will be re-joined upon reconnect (as channels
          // specified in options are)
          if (this.opt.channels.indexOf(channel) === -1) {
            this.opt.channels.push(channel);
          }

          if ( typeof callback === 'function' ) {
            return callback.apply(this, arguments);
          }
        });
        this.send.apply(this, ['JOIN'].concat(channel.split(' ')));
    };

    Client.prototype.part = function(channel, callback) {
      if ( typeof callback === 'function' ) {
        this.once('part' + channel, callback);
      }

      // remove this channel from this.opt.channels so we won't rejoin
      // upon reconnect
      if (this.opt.channels.indexOf(channel) !== -1) {
        this.opt.channels.splice(this.opt.channels.indexOf(channel), 1);
      }
      this.send('PART', channel);
    };

    Client.prototype.say = function(target, text) {
      var me = this;
      if (text != null) {
        text.toString().split(/\r?\n/).filter(function(line) {
          return line.length > 0;
        }).forEach(function(line) {
          me.send('PRIVMSG', target, line);
          me.emit('selfMessage', target, line);
        });
      }
    };

    Client.prototype.action = function(channel, text) {
      var me = this;
      if ( text != null) {
        text.toString().split(/\r?\n/).filter(function(line) {
          return line.length > 0;
        }).forEach(function(line) {
          me.say(channel, '\u0001ACTION ' + line + '\u0001');
        });
      }
    };

    Client.prototype.notice = function(target, text) {
        this.send('NOTICE', target, text);
    };

    Client.prototype.whois = function(nick, callback) {
      var callbackWrapper = null;
      if ( typeof callback === 'function' ) {
        callbackWrapper = function(info) {
          if ( info.nick === nick ) {
            this.removeListener('whois', callbackWrapper);
            return callback.apply(this, arguments);
          }
        };
        this.addListener('whois', callbackWrapper);
      }
      this.send('WHOIS', nick);
    };

    Client.prototype.list = function() {
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift('LIST');
        this.send.apply(this, args);
    };

    Client.prototype._addWhoisData = function(nick, key, value, onlyIfExists) {
      if ( onlyIfExists && !this._whoisData[nick] ) {
        return;
      }
      this._whoisData[nick] = this._whoisData[nick] || {nick: nick};
      this._whoisData[nick][key] = value;
    };
    
    Client.prototype._clearWhoisData = function(nick) {
      var data = this._whoisData[nick];
      delete this._whoisData[nick];
      return data;
    };

    Client.prototype._handleCTCP = function(from, to, text, type) {
      var parts = null;
      text = text.slice(1);
      text = text.slice(0, text.indexOf('\1'));
      parts = text.split(' ');
      this.emit('ctcp', from, to, text, type);
      this.emit('ctcp-'+type, from, to, text);
      if (type === 'privmsg' && text === 'VERSION') {
        this.emit('ctcp-version', from, to);
      }
      if (parts[0] === 'ACTION' && parts.length > 1) {
        this.emit('action', from, to, parts.slice(1).join(' '));
      }
      if (parts[0] === 'PING' && type === 'privmsg' && parts.length > 1) {
        this.ctcp(from, 'notice', text);
      }
    };

    Client.prototype.ctcp = function(to, type, text) {
      return this[type === 'privmsg' ? 'say' : 'notice'](to, '\1'+text+'\1');
    };

    /*
     * parseMessage(line, stripColors)
     *
     * takes a raw "line" from the IRC server and turns it into an object with
     * useful keys
     */
    function parseMessage(line, stripColors) {
      var message = {};
      var match = null;
      var middle, trailing;

      if (stripColors) {
        line = line.replace(/[\x02\x1f\x16\x0f]|\x03\d{0,2}(?:,\d{0,2})?/g, "");
      }

      // Parse prefix
      match = line.match(/^:([^ ]+) +/); 
      if (match) {
        message.prefix = match[1];
        line = line.replace(/^:[^ ]+ +/, '');
        match = message.prefix.match(/^([_a-zA-Z0-9\[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/); 
        if (match) {
          message.nick = match[1];
          message.user = match[3];
          message.host = match[4];
        } else {
          message.server = message.prefix;
        }
      }

      // Parse command
      match = line.match(/^([^ ]+) */);
      message.command = match[1];
      message.rawCommand = match[1];
      message.commandType = 'normal';
      line = line.replace(/^[^ ]+ +/, '');

      if ( codes[message.rawCommand] ) {
        message.command = codes[message.rawCommand].name;
        message.commandType = codes[message.rawCommand].type;
      }

      message.args = [];

      // Parse parameters
      if ( line.indexOf(':') !== -1 ) {
        match = line.match(/(.*)(?:^:|\s+:)(.*)/);
        middle = match[1].trimRight();
        trailing = match[2];
      } else {
        middle = line;
      }

      if ( middle.length ) {
        message.args = middle.split(/ +/);
      }

      if ( trailing != null && trailing.length ) {
        message.args.push(trailing);
      }

      return message;
    }

    return Client;


});
