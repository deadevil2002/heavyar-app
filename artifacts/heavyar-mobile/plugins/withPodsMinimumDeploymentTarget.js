const { withPodfile } = require('expo/config-plugins');

// Xcode 27 rejects pod targets (notably resource-bundle targets) that still
// declare an iOS deployment target below 15.0. Raise only those targets to the
// app's own minimum; targets that already declare a newer minimum are untouched.
const MARKER = '# heavyar: pods minimum deployment target';
const MINIMUM = '15.1';

module.exports = function withPodsMinimumDeploymentTarget(config) {
  return withPodfile(config, podfileConfig => {
    const contents = podfileConfig.modResults.contents;
    if (contents.includes(MARKER)) return podfileConfig;
    // Run after react_native_post_install so its target settings cannot undo this.
    const anchor = /(post_install do \|installer\|\n[\s\S]*?react_native_post_install\([\s\S]*?\n\s*\)\n)/;
    if (!anchor.test(contents)) throw new Error('withPodsMinimumDeploymentTarget: post_install block not found in Podfile');
    podfileConfig.modResults.contents = contents.replace(anchor, `$1    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_configuration|
        current = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${MINIMUM}')
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MINIMUM}'
        end
      end
    end
`);
    return podfileConfig;
  });
};
