var config = module.exports;

config['app'] = {
  rootPath: '.',
  autoRun: false,
  environment: 'browser',
  libs: [
    'src/lib/require.js',
    'src/config.js'
  ],
  sources: [],
  resources: [
    'src/**/*.*'
  ],
  tests: [
    'test/irc/*.js'
  ]
};
