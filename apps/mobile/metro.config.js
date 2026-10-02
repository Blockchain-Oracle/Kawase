const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

// On web, Metro resolves `tslib` through its "exports" to `modules/index.js`, an ESM wrapper whose default import
// of the CommonJS build comes back undefined ("Cannot destructure property '__extends' of 'tslib.default'"). Turnkey's
// web kit pulls tslib in through its dependencies, so on web every `tslib` import goes to the ES module build,
// resolved from the importing package so each keeps its own tslib version.
//
// On native, Turnkey's packages ship an ES module build ("import") and a CommonJS build ("require"). The wallet kit is
// imported as an ES module while @turnkey/core (CommonJS only) requires the same packages, so the bundle held two
// copies of @turnkey/sdk-types: the kit's `instanceof TurnkeyError` failed for core's errors and every failure
// reached the app as "UNKNOWN". Every @turnkey import resolves to the CommonJS build, one copy for all of them.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'tslib') {
    const main = require.resolve('tslib', { paths: [path.dirname(context.originModulePath)] });
    return { type: 'sourceFile', filePath: path.join(path.dirname(main), 'tslib.es6.js') };
  }
  const resolveContext =
    platform !== 'web' && moduleName.startsWith('@turnkey/') ? { ...context, isESMImport: false } : context;
  return resolveRequest
    ? resolveRequest(resolveContext, moduleName, platform)
    : context.resolveRequest(resolveContext, moduleName, platform);
};

// withUniwindConfig must stay the outermost wrapper.
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
  // Testnet is a hue layer over light and dark, so it needs one theme per scheme.
  extraThemes: ['testnet', 'testnet-dark'],
});
