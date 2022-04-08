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
                    from: 'vis-network.min.css*',
                    to: 'lib/',
                    context: 'node_modules/vis-network/styles/',
                },
                {
                    from: 'vis-network.min.js*',
                    to: 'lib/',
                    context: 'node_modules/vis-network/standalone/umd/',
                },
            ],
        }),
    ],
};
