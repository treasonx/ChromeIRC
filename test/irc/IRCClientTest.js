(function (g, require, undefined) {
  var buster = g.buster; 
  buster.spec.expose();

  var mockConnection = {
    setTimeout: function () {},
    setEncoding: function() {},
    addListener: function() {}
  }; 


  var mockTCP = {
    createConnection: function() {
      return mockConnection;
    }
  };

  function registerSpecs(Client) {

    describe('IRC client', function() {

      it('should construct an object', function() {
        var client = new Client('', '', {}, null, { autoConnect: false});
        expect(client).toBeTruthy();
        expect(typeof client.subscribe).toEqual('function');
        expect(typeof client.unsubscribe).toEqual('function');
        expect(typeof client.publish).toEqual('function');
      });  

      it('should bind events', function() {
        var client = new Client('', '', {}, null, { autoConnect: false});
        client.bindEvents();
        expect(client).toBeTruthy();
      });

      describe('client connection', function() {

        before(function() {
          this.client = new Client('', '', mockTCP, null, { autoConnect: false});
          this.spy(mockConnection, 'setTimeout');
          this.spy(mockConnection, 'setEncoding');
          this.spy(mockConnection, 'addListener');
          this.client.bindEvents();
        });
        
        it('should auto attempt to connect', function() {
          this.client.connect(); 
          expect(mockConnection.addListener.getCall(0).args[0]).toEqual('connect');
          expect(mockConnection.addListener.getCall(1).args[0]).toEqual('data');
          expect(mockConnection.addListener.getCall(2).args[0]).toEqual('end');
          expect(mockConnection.addListener.getCall(3).args[0]).toEqual('error');
        });

      });

      describe('client login', function() {
        it('should log into server', function() {
          expect(false).toBeTruthy();  
        }); 
      });

      describe('client message handling', function() {
        it('should handle messages', function() {
          
          expect(false).toBeTruthy();  
        });
      });

      describe('client error handling', function() {
        it('should handle errors', function() {
          
          expect(false).toBeTruthy();  
        });  
      });

      describe('client command handing', function() {
        it('should handle server commands', function() {
          
          expect(false).toBeTruthy();  
        });  
      });


      
    });
    
  }

  require(['irc/IRCClient'], function(Client) {
    registerSpecs(Client);
    buster.run();
  });
  
}(window, window.require));

