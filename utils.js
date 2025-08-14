const axios = require('axios');

// Helper function to introduce a random delay
const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min));

// Function to generate a grid of lat/lon points. Radius is in meters.
const generateGrid = (lat, lon, radius, points) => {
  const grid = [];
  const R = 6378137; // Earth’s radius in meters
  const d = radius;

  for (let i = 0; i < points; i++) {
    const brng = 2 * Math.PI * i / points;
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;

    let newLatRad = Math.asin(Math.sin(latRad) * Math.cos(d / R) +
                          Math.cos(latRad) * Math.sin(d / R) * Math.cos(brng));
    let newLonRad = lonRad + Math.atan2(Math.sin(brng) * Math.sin(d / R) * Math.cos(latRad),
                                 Math.cos(d / R) - Math.sin(latRad) * Math.sin(newLatRad));

    grid.push({ lat: newLatRad * 180 / Math.PI, lon: newLonRad * 180 / Math.PI });
  }
  return grid;
};

// --- Proxy Management ---
let proxyIndex = 0;
const getNextProxy = (proxies) => {
  if (!proxies || proxies.length === 0) return null;
  const proxy = proxies[proxyIndex];
  proxyIndex = (proxyIndex + 1) % proxies.length;
  return proxy;
};

// --- API Request with Retry ---
const axiosWithRetry = async (config, { retries = 3, backoff = 1000, proxies = [] }) => {
    let lastError;

    // Select a proxy once for all retries of this request
    const proxy = getNextProxy(proxies);
    const requestConfig = { ...config };

    if (proxy) {
        try {
            const proxyUrl = new URL(proxy);
            requestConfig.proxy = {
                protocol: proxyUrl.protocol.replace(':', ''),
                host: proxyUrl.hostname,
                port: parseInt(proxyUrl.port, 10),
            };
            if (proxyUrl.username && proxyUrl.password) {
                requestConfig.proxy.auth = {
                    username: proxyUrl.username,
                    password: proxyUrl.password,
                };
            }
        } catch (e) {
            console.error(`Invalid proxy URL: "${proxy}". This request will proceed without a proxy.`);
            // The request will be made without proxy settings if the URL is invalid
        }
    }

    for (let i = 0; i < retries; i++) {
        try {
            const response = await axios(requestConfig);
            return response;
        } catch (error) {
            lastError = error;
            console.warn(`Request failed (attempt ${i + 1}/${retries}): ${error.message}. Retrying in ${backoff}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoff));
            backoff *= 2; // Exponential backoff
        }
    }
    throw lastError;
};


module.exports = {
  randomDelay,
  generateGrid,
  getNextProxy,
  axiosWithRetry
};
