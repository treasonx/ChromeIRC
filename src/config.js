require.config({
  baseUrl: 'src/',
  paths: {
    underscore: 'lib/underscore-min',
    EventBus: 'lib/EventBus'
    
  },
  shim: {
    underscore: {
      exports: '_'  
    }
  }
});
