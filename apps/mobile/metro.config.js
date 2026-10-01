const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// On web, Metro resolves `tslib` through its "exports" to `modules/index.js`, an ESM wrapper whose default import
// of the CommonJS build comes back undefined ("Cannot destructure property '__extends' of 'tslib.default'"). Turnkey's
// web kit pulls tslib in through its dependencies, so on web every `tslib` import goes to the ES module build,
// resolved from the importing package so each keeps its own tslib version.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'tslib') {
    const main = require.resolve('tslib', { paths: [path.dirname(context.originModulePath)] });
    return { type: 'sourceFile', filePath: path.join(path.dirname(main), 'tslib.es6.js') };
  }
  return resolveRequest ? resolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

// withUniwindConfig must stay the outermost wrapper.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
  // Testnet is a hue layer over light and dark, so it needs one theme per scheme.
  extraThemes: ['testnet', 'testnet-dark'],
});
