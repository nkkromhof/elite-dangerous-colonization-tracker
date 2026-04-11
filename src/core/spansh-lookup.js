import { config } from '../config.js';
import { logger } from './logger.js';

const TAG = 'SpanshLookup';

const BASE_URL = config.spanshApiUrl;

// Rate limiting: be polite to Spansh API
const REQUEST_DELAY_MS = config.spanshRequestDelayMs; // 1 second between requests
const RETRY_DELAY_MS = config.spanshRetryDelayMs;   // 5 seconds after rate limit hit
const MAX_RETRIES = config.spanshMaxRetries;
const SEARCH_RANGE_LY = config.spanshSearchRangeLy;   // Must match INARA_SEARCH_RANGE in station-lookup-service.js

/**
 * Fetch station market data from Spansh API using marketId
 * @param {number} marketId - The market ID of the station
 * @returns {Promise<{data: object|null, transient: boolean}>}
 *   transient=true means a retriable error (rate limit, network)
 *   transient=false means a definitive answer (success or genuinely no results)
 */
export async function fetchStationMarket(marketId) {
  if (!marketId) {
    logger.warn(TAG, 'No marketId provided');
    return { data: null, transient: false };
  }

  const url = `${BASE_URL}/station/${marketId}`;
  logger.info(TAG, `REQUEST url=${url}`);

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });

      logger.info(TAG, `RESPONSE status=${resp.status}`);

      if (!resp.ok) {
        const body = await resp.text();
        logger.warn(TAG, `RESPONSE body:\n${body.substring(0, 500)}`);
        
        // Check if it's a retriable error
        const transient = [429, 502, 503, 504].includes(resp.status);
        
        if (transient && attempt < MAX_RETRIES) {
          lastError = new Error(`HTTP ${resp.status}`);
          logger.info(TAG, `Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        
        return { data: null, transient };
      }

      const data = await resp.json();
      logger.info(TAG, `Successfully fetched market data for marketId ${marketId}`);
      return { data, transient: false };
    } catch (err) {
      lastError = err;
      logger.warn(TAG, `Fetch failed for marketId ${marketId}: ${err?.message ?? err}`);
      
      // Network errors are generally retriable
      if (attempt < MAX_RETRIES) {
        logger.info(TAG, `Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      
      return { data: null, transient: true };
    }
  }

  // If we exhausted retries
  return { data: null, transient: true };
}

/**
 * Search for stations near a system that sell a specific commodity using Spansh API
 * @param {string} nameInternal - The internal name of the commodity
 * @param {string} systemName - The system to search near
 * @param {number} rangeLy - Search range in light years
 * @returns {Promise<Array<{station:string, system:string, distanceLy:number, supply:number|null}>}
 */
export async function searchStationForCommodity(nameInternal, systemName, rangeLy = SEARCH_RANGE_LY) {
  // First, we need to get the commodity ID from the internal name
  // For now, we'll need to map from EDCD names to Spansh commodity IDs
  // Since we don't have that mapping readily available, we'll use a placeholder
  // In a real implementation, we would need to build or fetch a commodity ID mapping for Spansh
  
  logger.info(TAG, `Searching for ${nameInternal} near ${systemName} within ${rangeLy} ly using Spansh`);
  
  // Spansh API endpoint for searching commodities
  // Based on the documentation: https://docs.spansh.co.uk/#/default/get_stations
  const url = `${BASE_URL}/stations`;
  const params = new URLSearchParams({
    system: systemName,
    range: rangeLy.toString(),
    // We would need to add the commodity ID here, but we don't have the mapping
    // For now, we'll return empty results and let the existing Inara lookup handle it
  });
  
  logger.info(TAG, `Spansh search URL would be: ${url}?${params.toString()}`);
  
  // TODO: Implement actual Spansh commodity search when we have the commodity ID mapping
  // For now, return empty array to fall back to Inara lookup
  return [];
}

/**
 * Parse Spansh market data to extract commodities and their quantities
 * @param {object} marketData - Raw market data from Spansh API
 * @returns {Array<{nameInternal: string, name: string, stock: number}>}
 */
export function parseMarketData(marketData) {
  if (!marketData || !marketData.station || !marketData.station.commodities) {
    return [];
  }

  return marketData.station.commodities
    .filter(commodity => commodity.stock > 0) // Only items with stock > 0
    .map(commodity => ({
      nameInternal: commodity.name_internal,
      name: commodity.name,
      stock: commodity.stock
    }));
}