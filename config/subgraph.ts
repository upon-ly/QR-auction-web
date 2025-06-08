// Subgraph Configuration
// This file manages switching between production and test subgraphs

// Check if we should use the test subgraph
const USE_TEST_SUBGRAPH = process.env.NEXT_PUBLIC_USE_TEST_SUBGRAPH === 'true';

// Subgraph URLs
const PRODUCTION_SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL!;
const TEST_SUBGRAPH_URL = process.env.NEXT_PUBLIC_TEST_SUBGRAPH_URL;

// Export the active subgraph URL
export const SUBGRAPH_URL = USE_TEST_SUBGRAPH && TEST_SUBGRAPH_URL 
  ? TEST_SUBGRAPH_URL 
  : PRODUCTION_SUBGRAPH_URL;

// Export configuration status
export const SUBGRAPH_CONFIG = {
  isTestMode: USE_TEST_SUBGRAPH,
  url: SUBGRAPH_URL,
  productionUrl: PRODUCTION_SUBGRAPH_URL,
  testUrl: TEST_SUBGRAPH_URL,
};

// Log configuration on startup (only in development)
if (process.env.NODE_ENV === 'development') {
  console.log('[Subgraph Config]', {
    mode: USE_TEST_SUBGRAPH ? 'TEST' : 'PRODUCTION',
    url: SUBGRAPH_URL,
  });
}