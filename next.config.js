const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.ignoreWarnings = [{ module: /node_modules\/punycode/ }];
    return config;
  }
};

module.exports = withNextIntl(nextConfig);
