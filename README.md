# Smart Google Maps Scraper

A smart, scalable, and stealthy scraping system for Google Maps. This scraper can handle large geographic areas, rotate proxies, retry failed requests, and even fall back to headless scraping for more data.

## Core Features

- **Geographic Grid Expansion**: Automatically breaks down large areas into a grid for comprehensive scraping.
- **De-Duplication**: Intelligently merges duplicate results from overlapping grid searches.
- **Proxy Rotation**: Supports HTTP/S proxies to distribute traffic and avoid IP bans.
- **Rate Limiting & Throttling**: Mimics human-like behavior with random delays between requests.
- **Retry on Failure**: Automatically retries failed API requests with exponential backoff.
- **Fallback Headless Scraping**: Uses Puppeteer to scrape websites for emails and social media links when API data is insufficient.
- **Concurrency Control**: Limits the number of concurrent scraping sessions to prevent system overload.
- **Enhanced JSON Output**: Provides detailed, clean JSON with enriched data, logs, and metadata.

## Setup

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Create a `.env` file:**
    Create a `.env` file in the root of the project and add your Google API key. You can also configure the advanced features here.
    ```env
    # REQUIRED
    GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY

    # OPTIONAL - See "Configuration" section for details
    PROXIES=http://user:pass@host:port,http://user:pass@host2:port2
    MAX_RETRIES=3
    INITIAL_BACKOFF=1000
    MIN_DELAY=100
    MAX_DELAY=500
    GRID_SEARCH_ENABLED=true
    GRID_POINTS=8
    FALLBACK_SCRAPING_ENABLED=true
    MAX_CONCURRENT_SESSIONS=5
    ```

3.  **Run the server:**
    ```bash
    npm start
    ```

## Usage

Send a `POST` request to the `/scrape` endpoint with a JSON body.

**Example Request:**
```json
{
  "city": "Delhi",
  "keyword": "restaurants",
  "radius": 20000
}
```

- `city` (required): The city you want to scrape.
- `keyword` (required): The keyword to search for (e.g., "cafe", "gym").
- `areas` (optional): An array of specific areas within the city to search. If `GRID_SEARCH_ENABLED` is true, this is ignored.
- `radius` (optional, default: 50000): The search radius in meters.

## Configuration (Environment Variables)

-   `GOOGLE_API_KEY`: Your Google Cloud API key with Places API and Geocoding API enabled.
-   `PROXIES`: A comma-separated list of proxy URLs (e.g., `http://user:pass@host:port`).
-   `MAX_RETRIES`: The maximum number of times to retry a failed API request (default: `3`).
-   `INITIAL_BACKOFF`: The initial delay in milliseconds for the first retry (default: `1000`).
-   `MIN_DELAY`, `MAX_DELAY`: The minimum and maximum delay in milliseconds between requests to throttle the scraper (default: `100`, `500`).
-   `GRID_SEARCH_ENABLED`: Set to `true` to enable geographic grid search (default: `false`).
-   `GRID_POINTS`: The number of points to generate in the grid (default: `8`).
-   `FALLBACK_SCRAPING_ENABLED`: Set to `true` to enable Puppeteer fallback scraping (default: `false`).
-   `MAX_CONCURRENT_SESSIONS`: The maximum number of concurrent scraping sessions allowed (default: `5`).

## Output Structure

The API returns a JSON object with the following structure:

```json
{
  "total_results": 1,
  "results": [
    {
      "business_name": "...",
      "category": "...",
      // ... other business details
      "is_duplicate": false,
      "fallback_data": {
        "emails": ["contact@example.com"],
        "social_media": ["https://facebook.com/example"]
      }
    }
  ],
  "retry_logs": [
    {
      "place_id": "...",
      "error": "...",
      "timestamp": "..."
    }
  ]
}
```

## Cloud Run Compatibility

This application is designed to be compatible with Google Cloud Run. The included `Dockerfile` can be used to build and deploy the container.
