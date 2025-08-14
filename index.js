require('dotenv').config(); // ✅ Load environment variables

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const {
    randomDelay,
    generateGrid,
    axiosWithRetry
} = require('./utils');

const app = express();
app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "YOUR_API_KEY_HERE";
const PROXIES = process.env.PROXIES ? process.env.PROXIES.split(',') : [];
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3;
const INITIAL_BACKOFF = parseInt(process.env.INITIAL_BACKOFF, 10) || 1000;
const MIN_DELAY = parseInt(process.env.MIN_DELAY, 10) || 100;
const MAX_DELAY = parseInt(process.env.MAX_DELAY, 10) || 500;
const GRID_SEARCH_ENABLED = process.env.GRID_SEARCH_ENABLED === 'true';
const GRID_POINTS = parseInt(process.env.GRID_POINTS, 10) || 8;
const FALLBACK_SCRAPING_ENABLED = process.env.FALLBACK_SCRAPING_ENABLED === 'true';
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_CONCURRENT_SESSIONS, 10) || 5;

let activeSessions = 0;

// --- Puppeteer Fallback Scraping ---
const scrapeFallbackData = async (url) => {
    if (!FALLBACK_SCRAPING_ENABLED) return null;

    let browser;
    try {
        console.log(`🤖 Launching Puppeteer to scrape ${url}`);
        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        const data = await page.evaluate(() => {
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
            const socialRegex = /facebook\.com|twitter\.com|linkedin\.com|instagram\.com/gi;

            const emails = new Set(document.body.innerText.match(emailRegex) || []);
            const socialLinks = new Set();
            document.querySelectorAll('a').forEach(a => {
                if (a.href.match(socialRegex)) {
                    socialLinks.add(a.href);
                }
            });

            return {
                emails: [...emails],
                social_media: [...socialLinks]
            };
        });
        console.log(`✅ Puppeteer scraped data for ${url}:`, data);
        return data;
    } catch (error) {
        console.error(`❌ Puppeteer failed for ${url}:`, error.message);
        return { error: error.message };
    } finally {
        if (browser) await browser.close();
    }
};


// --- Google Maps API Functions ---
const getPlaceDetails = async (placeId, retryLogs) => {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_address,plus_code,opening_hours,international_phone_number,website,price_level,url,editorial_summary&key=${GOOGLE_API_KEY}`;
    try {
        const { data } = await axiosWithRetry({ url: detailsUrl }, { retries: MAX_RETRIES, backoff: INITIAL_BACKOFF, proxies: PROXIES });
        return data.result;
    } catch (error) {
        console.error(`Failed to get details for place_id: ${placeId} after all retries.`, error.message);
        retryLogs.push({ place_id: placeId, error: error.message, timestamp: new Date().toISOString() });
        return null;
    }
};

// --- Main Scrape Endpoint ---
app.post('/scrape', async (req, res) => {
    if (activeSessions >= MAX_CONCURRENT_SESSIONS) {
        return res.status(429).json({ message: "Too many concurrent requests. Please try again later." });
    }

    activeSessions++;

    try {
        const { city, keyword, areas, radius = 50000 } = req.body;

        const allResults = new Map();
        const retryLogs = [];

        let searchLocations = [];

        if (GRID_SEARCH_ENABLED) {
            console.log(`🌍 Grid search enabled. Generating grid for "${city}"...`);
            const geoResp = await axiosWithRetry({ url: `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${GOOGLE_API_KEY}` }, { retries: MAX_RETRIES, backoff: INITIAL_BACKOFF, proxies: PROXIES });
            const location = geoResp.data.results[0]?.geometry.location;
            if (location) {
                searchLocations = generateGrid(location.lat, location.lng, radius, GRID_POINTS);
                console.log(`✅ Generated ${searchLocations.length} grid points.`);
            } else {
                console.warn(`📍 Could not find location for "${city}" to generate grid.`);
            }
        } else {
            const searchQueries = areas && areas.length > 0 ? areas.map(area => `${keyword} ${area} ${city}`) : [`${keyword} ${city}`];
            for (const query of searchQueries) {
                const geoResp = await axiosWithRetry({ url: `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`}, { retries: MAX_RETRIES, backoff: INITIAL_BACKOFF, proxies: PROXIES });
                const location = geoResp.data.results[0]?.geometry.location;
                if (location) {
                    searchLocations.push(location);
                } else {
                    console.warn(`📍 Location not found for "${query}"`);
                }
            }
        }

        for (const location of searchLocations) {
            console.log(`🔍 Searching at lat=${location.lat}, lng=${location.lon || location.lng}`);
            let pagetoken = null;
            do {
                const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lon || location.lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&key=${GOOGLE_API_KEY}${pagetoken ? `&pagetoken=${pagetoken}` : ''}`;

                try {
                    const { data } = await axiosWithRetry({ url }, { retries: MAX_RETRIES, backoff: INITIAL_BACKOFF, proxies: PROXIES });

                    if (data.results) {
                        for (const place of data.results) {
                            if (allResults.has(place.place_id)) {
                                const existingPlace = allResults.get(place.place_id);
                                if(existingPlace) existingPlace.is_duplicate = true;
                            } else {
                                place.is_duplicate = false;
                                allResults.set(place.place_id, place);
                            }
                        }
                    }

                    pagetoken = data.next_page_token;
                    if (pagetoken) await randomDelay(2000, 3000); // Increased and randomized delay for pagination

                } catch (error) {
                    console.error('❌ Nearby search failed:', error.message);
                    retryLogs.push({ location, error: error.message, timestamp: new Date().toISOString() });
                    pagetoken = null; // Stop pagination for this location on failure
                }

            } while (pagetoken && allResults.size < 120); // Limit total results for now

            await randomDelay(MIN_DELAY, MAX_DELAY);
        }

        const enrichedResults = [];
        for (const place of Array.from(allResults.values())) {
            const details = await getPlaceDetails(place.place_id, retryLogs);
            const fallback_data = details && details.website ? await scrapeFallbackData(details.website) : null;

            enrichedResults.push({ ...place, ...details, fallback_data });
            await randomDelay(MIN_DELAY, MAX_DELAY);
        }

        const formatted = enrichedResults.map(place => ({
            business_name: place.name,
            category: place.types?.[0],
            rating: place.rating,
            review_count: place.user_ratings_total,
            address: place.formatted_address || place.vicinity,
            plus_code: place.plus_code?.global_code,
            google_maps_url: place.url,
            opening_hours: place.opening_hours?.weekday_text,
            phone_number: place.international_phone_number,
            website_url: place.website,
            business_status: place.business_status,
            photo_urls: place.photos?.map(p => `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${p.photo_reference}&key=${GOOGLE_API_KEY}`) || [],
            latitude: place.geometry?.location?.lat,
            longitude: place.geometry?.location?.lng,
            description: place.editorial_summary?.overview,
            price_level: place.price_level,
            place_id: place.place_id,
            is_duplicate: place.is_duplicate,
            fallback_data: place.fallback_data
        }));

        res.json({
            total_results: formatted.length,
            results: formatted,
            retry_logs: retryLogs
        });

    } catch (error) {
        console.error('❌ Scrape failed:', error.message, error.stack);
        res.status(500).json({ error: 'Scrape failed', details: error.message });
    } finally {
        activeSessions--;
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔧 Configuration:`);
    console.log(`  - Grid Search: ${GRID_SEARCH_ENABLED}`);
    console.log(`  - Fallback Scraping: ${FALLBACK_SCRAPING_ENABLED}`);
    console.log(`  - Max Concurrent Sessions: ${MAX_CONCURRENT_SESSIONS}`);
});
