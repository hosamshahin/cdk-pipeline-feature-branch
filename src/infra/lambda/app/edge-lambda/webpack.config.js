const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  mode: "production",
  target: "node",
  node: {
    __dirname: false,
  },
  entry: {
    "check-auth/bundle": path.resolve(__dirname, "./check-auth/index.ts"),
    "generate-secret/bundle": path.resolve(__dirname, "./generate-secret/index.ts"),
    "http-headers/bundle": path.resolve(__dirname, "./http-headers/index.ts"),
    "lambda-code-update/bundle": path.resolve(__dirname, "./lambda-code-update/index.ts"),
    "parse-auth/bundle": path.resolve(__dirname, "./parse-auth/index.ts"),
    "refresh-auth/bundle": path.resolve(__dirname, "./refresh-auth/index.ts"),
    "rewrite-trailing-slash/bundle": path.resolve(__dirname, "./rewrite-trailing-slash/index.ts"),
    "sign-out/bundle": path.resolve(__dirname, "./sign-out/index.ts"),
    "get-root-object/bundle": path.resolve(__dirname, "./get-root-object/index.ts"),
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader",
        exclude: /node_modules/,
        options: {
          configFile: "dev.tsconfig.json",
        },
      },
      {
        test: /\.html$/i,
        loader: "html-loader",
        options: {
          minimize: true,
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    path: path.resolve(__dirname, "bundles"),
    filename: "[name].js",
    libraryTarget: "commonjs",
  },
  externals: [
    /^aws-sdk/, // Don't include the aws-sdk in bundles as it is already present in the Lambda runtime
  ],
  performance: {
    hints: "error",
    maxAssetSize: 1048576, // Max size of deployment bundle in Lambda@Edge Viewer Request
    maxEntrypointSize: 1048576, // Max size of deployment bundle in Lambda@Edge Viewer Request
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
        extractComments: true,
      }),
    ],
  },
};
