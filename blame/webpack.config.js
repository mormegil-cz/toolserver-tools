const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

module.exports = {
    entry: './src/main.ts',
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.(scss)$/,
                use: [
                  {
                    loader: MiniCssExtractPlugin.loader
                  },
                  {
                    loader: 'css-loader'
                  },
                  {
                    loader: 'postcss-loader',
                    options: {
                      postcssOptions: {
                        plugins: () => [
                          require('autoprefixer')
                        ]
                      }
                    }
                  },
                  {
                    loader: 'sass-loader'
                  }
                ]
              }
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    externals: {
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
        new MiniCssExtractPlugin(),
        new CopyPlugin({
            patterns: [
                {
                    from: '*.htm',
                    context: 'src/',
                }
            ],
        }),
    ],
};
