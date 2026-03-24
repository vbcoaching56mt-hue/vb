const webpack = require('webpack');
module.exports = function override(config) {
  const fallback = config.resolve.fallback || {};
  Object.assign(fallback, {
    "buffer": require.resolve("buffer/"),
    "process": require.resolve("process/browser.js"),
    "stream": require.resolve("stream-browserify"),
  });
  config.resolve.fallback = fallback;
  config.module.rules.push({
    test: /\.m?js/,
    resolve: { fullySpecified: false },
  });
  config.plugins = (config.plugins || []).concat([
    new webpack.ProvidePlugin({
      process: 'process/browser.js',
      Buffer: ['buffer', 'Buffer'],
    }),
  ]);
  return config;
};
