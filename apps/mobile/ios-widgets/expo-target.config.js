/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "StashBroWidget",
  deploymentTarget: "16.0",
  // ponytail: app group entitlements auto-mirrored from ios.entitlements in app.json
  // (widget type has appGroupsByDefault: true in @bacons/apple-targets)
};
