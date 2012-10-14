define(['irc/codes'], function(codes) {
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
      'rpl_motdstart': function (message, clent) {
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



    function Client(server, nick, opt) {
        var self = this;
        self.opt = {
            server: server,
            nick: nick,
            password: null,
            userName: 'nodebot',
            realName: 'nodeJS IRC client',
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

        if (typeof arguments[2] === 'object') {
            var keys = Object.keys(self.opt);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (arguments[2][k] !== undefined) {
                    self.opt[k] = arguments[2][k];
                }

            }
        }

        if (self.opt.floodProtection) {
            self.activateFloodProtection();
        }


        if (self.opt.autoConnect === true) {
            self.connect();
        }

        self.addListener("raw", function (message) { // {{{
            switch ( message.command ) {
                case "err_umodeunknownflag":
                    break;
            }
        }); // }}}

        self.addListener('kick', function(channel, who, by, reason) {
            if ( self.opt.autoRejoin )
                self.send.apply(self, ['JOIN'].concat(channel.split(' ')));
        });
        self.addListener('motd', function (motd) {
            self.opt.channels.forEach(function(channel) {
                self.send.apply(self, ['JOIN'].concat(channel.split(' ')));
            });
        });

        process.EventEmitter.call(this);
    }


    Client.prototype.conn = null;
    Client.prototype.prefixForMode = {};
    Client.prototype.modeForPrefix = {};
    Client.prototype.chans = {};
    Client.prototype._whoisData = {};
    Client.prototype.chanData = function( name, create ) { // {{{
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
    } // }}}
    Client.prototype.connect = function ( retryCount, callback ) { // {{{
        if ( typeof(retryCount) === 'function' ) {
            callback = retryCount;
            retryCount = undefined;
        }
        retryCount = retryCount || 0;
        if (typeof(callback) === 'function') {
            this.once('registered', callback);
        }
        var self = this;
        self.chans = {};
        // try to connect to the server
        if (self.opt.secure) {
            var creds = self.opt.secure;
            if (typeof self.opt.secure !== 'object') {
                creds = {};
            }

            self.conn = tls.connect(self.opt.port, self.opt.server, creds, function() {
                // callback called only after successful socket connection
                self.conn.connected = true;
                if (self.conn.authorized ||
                    (self.opt.selfSigned &&
                        self.conn.authorizationError === 'DEPTH_ZERO_SELF_SIGNED_CERT') ||
                    (self.opt.certExpired &&
                        self.conn.authorizationError === 'CERT_HAS_EXPIRED')) {
                    // authorization successful
                    self.conn.setEncoding('utf-8');
                    if ( self.opt.certExpired &&
                        self.conn.authorizationError === 'CERT_HAS_EXPIRED' ) {
                        util.log('Connecting to server with expired certificate');
                    }
                    if ( self.opt.password !==  null ) {
                        self.send( "PASS", self.opt.password );
                    }
                    util.log('Sending irc NICK/USER');
                    self.send("NICK", self.opt.nick);
                    self.nick = self.opt.nick;
                    self.send("USER", self.opt.userName, 8, "*", self.opt.realName);
                    self.emit("connect");
                } else {
                    // authorization failed
                    util.log(self.conn.authorizationError);
                }
            });
        }else {
            self.conn = net.createConnection(self.opt.port, self.opt.server);
        }
        self.conn.requestedDisconnect = false;
        self.conn.setTimeout(0);
        self.conn.setEncoding('utf8');
        self.conn.addListener("connect", function () {
            if ( self.opt.password !==  null ) {
                self.send( "PASS", self.opt.password );
            }
            self.send("NICK", self.opt.nick);
            self.nick = self.opt.nick;
            self.send("USER", self.opt.userName, 8, "*", self.opt.realName);
            self.emit("connect");
        });
        var buffer = '';
        self.conn.addListener("data", function (chunk) {
            buffer += chunk;
            var lines = buffer.split("\r\n");
            buffer = lines.pop();
            lines.forEach(function (line) {
                var message = parseMessage(line, self.opt.stripColors);
                try {
                    self.emit('raw', message);
                } catch ( err ) {
                    if ( !self.conn.requestedDisconnect ) {
                        throw err;
                    }
                }
            });
        });
        self.conn.addListener("end", function() {
            if ( self.opt.debug )
                util.log('Connection got "end" event');
        });
        self.conn.addListener("close", function() {
            if ( self.opt.debug )
                util.log('Connection got "close" event');
            if ( self.conn.requestedDisconnect )
                return;
            if ( self.opt.debug )
                util.log('Disconnected: reconnecting');
            if ( self.opt.retryCount !== null && retryCount >= self.opt.retryCount ) {
                if ( self.opt.debug ) {
                    util.log( 'Maximum retry count (' + self.opt.retryCount + ') reached. Aborting' );
                }
                self.emit( 'abort', self.opt.retryCount );
                return;
            }

            if ( self.opt.debug ) {
                util.log( 'Waiting ' + self.opt.retryDelay + 'ms before retrying' );
            }
            setTimeout( function() {
                self.connect( retryCount + 1 );
            }, self.opt.retryDelay );
        });
        self.conn.addListener("error", function(exception) {
            self.emit("netError", exception);
        });
    }; // }}}
    Client.prototype.disconnect = function ( message, callback ) { // {{{
        if ( typeof(message) === 'function' ) {
            callback = message;
            message = undefined;
        }
        message = message || "node-irc says goodbye";
        var self = this;
        if ( self.conn.readyState == 'open' ) {
            self.send( "QUIT", message );
        }
        self.conn.requestedDisconnect = true;
        if (typeof(callback) === 'function') {
            self.conn.once('end', callback);
        }
        self.conn.end();
    }; // }}}
    Client.prototype.send = function(command) { // {{{
        var args = Array.prototype.slice.call(arguments);

        // Remove the command
        args.shift();

        if ( args[args.length-1].match(/\s/) ) {
            args[args.length-1] = ":" + args[args.length-1];
        }

        if ( this.opt.debug )
            util.log('SEND: ' + command + " " + args.join(" "));

        if ( ! this.conn.requestedDisconnect ) {
            this.conn.write(command + " " + args.join(" ") + "\r\n");
        }
    }; // }}}
    Client.prototype.activateFloodProtection = function(interval) { // {{{

        var cmdQueue = [],
            safeInterval = interval || this.opt.floodProtectionDelay,
            self = this,
            origSend = this.send,
            dequeue;

        // Wrapper for the original function. Just put everything to on central
        // queue.
        this.send = function() {
            cmdQueue.push(arguments);
        };

        dequeue = function() {
            var args = cmdQueue.shift();
            if (args) {
                origSend.apply(self, args);
            }
        };

        // Slowly unpack the queue without flooding.
        setInterval(dequeue, safeInterval);
        dequeue();


    }; // }}}
    Client.prototype.join = function(channel, callback) { // {{{
        this.once('join' + channel, function () {
            // if join is successful, add this channel to opts.channels
            // so that it will be re-joined upon reconnect (as channels
            // specified in options are)
            if (this.opt.channels.indexOf(channel) == -1) {
                this.opt.channels.push(channel);
            }

            if ( typeof(callback) == 'function' ) {
                return callback.apply(this, arguments);
            }
        });
        this.send.apply(this, ['JOIN'].concat(channel.split(' ')));
    } // }}}
    Client.prototype.part = function(channel, callback) { // {{{
        if ( typeof(callback) == 'function' ) {
            this.once('part' + channel, callback);
        }

        // remove this channel from this.opt.channels so we won't rejoin
        // upon reconnect
        if (this.opt.channels.indexOf(channel) != -1) {
            this.opt.channels.splice(this.opt.channels.indexOf(channel), 1);
        }

        this.send('PART', channel);
    } // }}}
    Client.prototype.say = function(target, text) { // {{{
        var self = this;
        if (typeof text !== 'undefined') {
            text.toString().split(/\r?\n/).filter(function(line) {
                return line.length > 0;
            }).forEach(function(line) {
                    self.send('PRIVMSG', target, line);
                    self.emit('selfMessage', target, line);
                });
        }
    } // }}}
    Client.prototype.action = function(channel, text) { // {{{
        var self = this;
        if (typeof text !== 'undefined') {
            text.toString().split(/\r?\n/).filter(function(line) {
                return line.length > 0;
            }).forEach(function(line) {
                    self.say(channel, '\u0001ACTION ' + line + '\u0001');
                });
        }
    } // }}}
    Client.prototype.notice = function(target, text) { // {{{
        this.send('NOTICE', target, text);
    } // }}}
    Client.prototype.whois = function(nick, callback) { // {{{
        if ( typeof callback === 'function' ) {
            var callbackWrapper = function(info) {
                if ( info.nick == nick ) {
                    this.removeListener('whois', callbackWrapper);
                    return callback.apply(this, arguments);
                }
            };
            this.addListener('whois', callbackWrapper);
        }
        this.send('WHOIS', nick);
    } // }}}
    Client.prototype.list = function() { // {{{
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift('LIST');
        this.send.apply(this, args);
    } // }}}
    Client.prototype._addWhoisData = function(nick, key, value, onlyIfExists) { // {{{
        if ( onlyIfExists && !this._whoisData[nick] ) return;
        this._whoisData[nick] = this._whoisData[nick] || {nick: nick};
        this._whoisData[nick][key] = value;
    } // }}}
    Client.prototype._clearWhoisData = function(nick) { // {{{
        var data = this._whoisData[nick];
        delete this._whoisData[nick];
        return data;
    } // }}}
    Client.prototype._handleCTCP = function(from, to, text, type) {
        text = text.slice(1)
        text = text.slice(0, text.indexOf('\1'))
        var parts = text.split(' ')
        this.emit('ctcp', from, to, text, type)
        this.emit('ctcp-'+type, from, to, text)
        if (type === 'privmsg' && text === 'VERSION')
            this.emit('ctcp-version', from, to)
        if (parts[0] === 'ACTION' && parts.length > 1)
            this.emit('action', from, to, parts.slice(1).join(' '))
        if (parts[0] === 'PING' && type === 'privmsg' && parts.length > 1)
            this.ctcp(from, 'notice', text)
    }
    Client.prototype.ctcp = function(to, type, text) {
        return this[type === 'privmsg' ? 'say' : 'notice'](to, '\1'+text+'\1');
    }

    /*
     * parseMessage(line, stripColors)
     *
     * takes a raw "line" from the IRC server and turns it into an object with
     * useful keys
     */
    function parseMessage(line, stripColors) { // {{{
        var message = {};
        var match;

        if (stripColors) {
            line = line.replace(/[\x02\x1f\x16\x0f]|\x03\d{0,2}(?:,\d{0,2})?/g, "");
        }

        // Parse prefix
        if ( match = line.match(/^:([^ ]+) +/) ) {
            message.prefix = match[1];
            line = line.replace(/^:[^ ]+ +/, '');
            if ( match = message.prefix.match(/^([_a-zA-Z0-9\[\]\\`^{}|-]*)(!([^@]+)@(.*))?$/) ) {
                message.nick = match[1];
                message.user = match[3];
                message.host = match[4];
            }
            else {
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
            message.command     = codes[message.rawCommand].name;
            message.commandType = codes[message.rawCommand].type;
        }

        message.args = [];
        var middle, trailing;

        // Parse parameters
        if ( line.indexOf(':') != -1 ) {
            match = line.match(/(.*)(?:^:|\s+:)(.*)/);
            middle = match[1].trimRight();
            trailing = match[2];
        }
        else {
            middle = line;
        }

        if ( middle.length )
            message.args = middle.split(/ +/);

        if ( typeof(trailing) != 'undefined' && trailing.length )
            message.args.push(trailing);

        return message;
    } // }}}


});
