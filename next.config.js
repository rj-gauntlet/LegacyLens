/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@pinecone-database/pinecone", "@langchain/openai", "@langchain/core", "openai"],
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
