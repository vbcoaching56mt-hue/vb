const webpack = require('webpack');
const path = require('path');

module.exports = function override(config) {
  // 1. Webpack 5 Polyfills (uniquement ceux installés dans package.json)
  const fallback = config.resolve.fallback || {};
  Object.assign(fallback, {
    "buffer": require.resolve("buffer/"),
    "process": require.resolve("process/browser.js"),
    "stream": require.resolve("stream-browserify"),
  });
  config.resolve.fallback = fallback;

  // 2. Gestion des imports ESM (fully specified)
  config.module.rules.push({
    test: /\.m?js$/,
    resolve: {
      fullySpecified: false,
    },
  });

  // 3. Injection globale de Buffer et process
  config.plugins = [
    ...(config.plugins || []),
    new webpack.ProvidePlugin({
      process: 'process/browser.js',
      Buffer: ['buffer', 'Buffer'],
    }),
  ];

  // 4. Ignorer les avertissements de source-map
  config.ignoreWarnings = [/Failed to parse source map/];

  return config;
};
