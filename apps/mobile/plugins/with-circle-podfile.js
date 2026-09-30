// Podfile changes that Circle's wallet SDK needs on iOS.
// This replaces the SDK's own `podfile-modifier` plugin, which adds the full CocoaPods git spec repo as a
// source (a 1.3 GB clone on every fresh machine and CI run). Here the public specs come from the CDN.
// The rest matches the SDK's plugin: Circle's spec repo, static frameworks, and its dynamic exceptions.
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs/promises');
const path = require('path');

const CIRCLE_SOURCE = "source 'https://github.com/circlefin/w3s-ios-sdk.git'";
const CDN_SOURCE = "source 'https://cdn.cocoapods.org/'";
const DYNAMIC_FRAMEWORKS = `
  # Circle wallet SDK: these pods must stay dynamic while everything else links statically.
  dynamic_frameworks = ['GoogleSignIn', 'FBSDKLoginKit', 'AppAuth', 'GTMAppAuth', 'GTMSessionFetcher']

  pre_install do |installer|
    installer.pod_targets.each do |target|
      if dynamic_frameworks.include?(target.name)
        def target.build_type
          Pod::BuildType.dynamic_framework
        end
      end
    end
  end`;

module.exports = function withCirclePodfile(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');
      let content = await fs.readFile(podfilePath, 'utf8');

      if (!content.includes('circlefin/w3s-ios-sdk.git')) content = `${CIRCLE_SOURCE}\n${content}`;
      if (!content.includes('cdn.cocoapods.org')) content = `${CDN_SOURCE}\n${content}`;

      if (!content.includes('dynamic_frameworks')) {
        content = content.replace(/(target ['"][^'"]*['"] do)/, `$1${DYNAMIC_FRAMEWORKS}`);
        const matches = [...content.matchAll(/use_frameworks!.*\n/g)];
        const last = matches.at(-1);
        if (last) {
          const position = last.index + last[0].length;
          content = `${content.slice(0, position)}  # Circle wallet SDK needs static frameworks.\n  use_frameworks! :linkage => :static\n${content.slice(position)}`;
        }
      }

      await fs.writeFile(podfilePath, content, 'utf8');
      return modConfig;
    },
  ]);
};
