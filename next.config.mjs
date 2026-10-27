/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.1.10"],
  eslint: { ignoreDuringBuilds: true },
  // Server oft stark ausgelastet: Seiten-Sammeln darf länger als 60 s dauern (sonst bricht der Build ab)
  staticPageGenerationTimeout: 600,
};

export default nextConfig;
