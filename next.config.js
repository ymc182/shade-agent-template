import withTM from 'next-transpile-modules';

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    webpack: (config, { isServer }) => {
        if (!isServer) {
            config.resolve.fallback = {
                net: false,
                fs: false,
                tls: false,
                crypto: false,
                stream: 'stream-browserify',
                url: 'url',
                http: 'stream-http',
                https: 'https-browserify',
                assert: 'assert',
                os: 'os-browserify',
                path: 'path-browserify',
            };
        }
        
        // Add extension resolution
        config.resolve.extensions = ['.js', '.jsx', '.ts', '.tsx', ...config.resolve.extensions];
        
        return config;
    },
};

const withTranspileModules = withTM(['chainsig.js', '@cosmjs/proto-signing', 'cosmjs-types', '@near-js/keystores', '@near-js/crypto', '@near-js/utils', '@near-js/types']);

export default withTranspileModules(nextConfig);
