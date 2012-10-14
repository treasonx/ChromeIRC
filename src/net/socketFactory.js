define([], function() {

  /**
   * Returns a factory which will return a generic socket for the given
   * javascript environment
   */

  var socketAdaptors = {};
  
  return function(environment) {
     return socketAdaptors[environment];
  };
  
});
