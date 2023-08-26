const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    entry: './src/main.ts',
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    externals: {
        'vis-network/standalone': 'vis',
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                {
                    from: '*.htm',
                    context: 'src/',
                },
                {
                    from: '*.css',
                    context: 'src/',
                },
                {
                    from: 'assets/*'
                },
                {
                    from: 'vis-network.min.css*',
                    to: 'lib/',
                    context: 'node_modules/vis-network/styles/',
                },
                {
                    from: 'vis-network.min.js*',
                    to: 'lib/',
                    context: 'node_modules/vis-network/standalone/umd/',
                },
                // TODO: Replace with CSS bundling+minimization
                {
                    from: 'toastify.css',
                    to: 'lib/',
                    context: 'node_modules/toastify-js/src/'
                }
            ],
        }),
    ],
};
