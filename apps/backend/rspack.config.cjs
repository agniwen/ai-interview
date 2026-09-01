const nodeExternals = require("webpack-node-externals");

module.exports = function configureRspack(defaults) {
  return {
    ...defaults,
    externals: [
      nodeExternals({ allowlist: [/^@arc\//], importType: "module" }),
      ...defaults.externals.slice(1),
    ],
  };
};
