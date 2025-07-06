import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Admin addresses for authorization
const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8",
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4"
];

interface AuctionExpenseData {
  auction_id: number;
  date: string; // Date of the auction (first claim date)
  web_claims: number;
  web_total_qr: number;
  web_avg_qr_per_claim: number;
  miniapp_claims: number;
  miniapp_total_qr: number;
  miniapp_avg_qr_per_claim: number;
  total_claims: number;
  total_qr_distributed: number;
  total_expense_usd: number;
  qr_price_usd: number;
  has_historical_price: boolean;
}

interface RewardTierBreakdown {
  auction_id: number;
  date: string; // Date of the auction
  // Web tiers
  web_100_qr_claims: number;
  web_500_qr_claims: number;
  // Mini-app tiers  
  miniapp_100_qr_claims: number;
  miniapp_1000_qr_claims: number;
  // Legacy claim amounts
  legacy_420_qr_claims: number;
  legacy_2000_qr_claims: number;
  legacy_5000_qr_claims: number;
}

export async function GET(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const address = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Check if address is authorized
    if (!ADMIN_ADDRESSES.includes(address.toLowerCase())) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get QR price overrides from query params
    const { searchParams } = new URL(request.url);
    const qrPriceOverridesParam = searchParams.get('qrPriceOverrides');
    let qrPriceOverrides: { [auctionId: number]: number } = {};
    
    if (qrPriceOverridesParam) {
      try {
        qrPriceOverrides = JSON.parse(qrPriceOverridesParam);
      } catch (error) {
        console.error('Failed to parse QR price overrides:', error);
      }
    }

    // Query for auction-based link visit claim expenses with reward tier breakdown
    const { data: auctionData, error: auctionError } = await supabase
      .from('link_visit_claims')
      .select(`
        auction_id,
        amount,
        claim_source,
        claimed_at,
        success
      `)
      .eq('success', true)
      .not('claimed_at', 'is', null)
      .order('auction_id', { ascending: true });

    if (auctionError) {
      console.error('Error fetching auction link visit claims:', auctionError);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch auction link visit claims data'
      }, { status: 500 });
    }

    // Get real-time QR price from DexScreener API
    let DEFAULT_QR_PRICE_USD = 0.01; // Fallback price
    try {
      const priceResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/0x2b5050F01d64FBb3e4Ac44dc07f0732BFb5ecadF`);
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        if (priceData?.pairs?.[0]?.priceUsd) {
          DEFAULT_QR_PRICE_USD = parseFloat(priceData.pairs[0].priceUsd);
          console.log(`Using real-time QR price: $${DEFAULT_QR_PRICE_USD}`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch QR price, using fallback:', error);
    }

    // Use QR price overrides if provided, otherwise fall back to historical prices
    let historicalPriceMap: { [key: number]: number } = {};
    
    if (Object.keys(qrPriceOverrides).length > 0) {
      // Use the provided overrides (from cost-per-claim data)
      historicalPriceMap = qrPriceOverrides;
      console.log('Using QR price overrides from cost-per-claim data');
    } else {
      // Fall back to historical prices table
      const { data: historicalPrices } = await supabase
        .from('historical_qr_prices')
        .select('auction_id, qr_price_usd');
      
      historicalPrices?.forEach(price => {
        historicalPriceMap[price.auction_id] = price.qr_price_usd;
      });
      console.log('Using historical QR prices from database');
    }

    // Process data by auction ID and claim source
    const auctionExpenses: { [key: number]: AuctionExpenseData } = {};
    const rewardTierBreakdowns: { [key: number]: RewardTierBreakdown } = {};
    const auctionDates: { [key: number]: string } = {};

    auctionData?.forEach(claim => {
      const auctionId = claim.auction_id;
      const date = new Date(claim.claimed_at).toISOString().split('T')[0]; // YYYY-MM-DD format
      const isWeb = ['web', 'mobile'].includes(claim.claim_source || '');
      const amount = claim.amount || 0;

      // Track the earliest date for each auction
      if (!auctionDates[auctionId] || date < auctionDates[auctionId]) {
        auctionDates[auctionId] = date;
      }

      // Initialize auction data if not exists
      if (!auctionExpenses[auctionId]) {
        const qrPrice = historicalPriceMap[auctionId] || DEFAULT_QR_PRICE_USD;
        auctionExpenses[auctionId] = {
          auction_id: auctionId,
          date: date,
          web_claims: 0,
          web_total_qr: 0,
          web_avg_qr_per_claim: 0,
          miniapp_claims: 0,
          miniapp_total_qr: 0,
          miniapp_avg_qr_per_claim: 0,
          total_claims: 0,
          total_qr_distributed: 0,
          total_expense_usd: 0,
          qr_price_usd: qrPrice,
          has_historical_price: Boolean(historicalPriceMap[auctionId])
        };
      }

      // Initialize reward tier breakdown if not exists
      if (!rewardTierBreakdowns[auctionId]) {
        rewardTierBreakdowns[auctionId] = {
          auction_id: auctionId,
          date: date,
          web_100_qr_claims: 0,
          web_500_qr_claims: 0,
          miniapp_100_qr_claims: 0,
          miniapp_1000_qr_claims: 0,
          legacy_420_qr_claims: 0,
          legacy_2000_qr_claims: 0,
          legacy_5000_qr_claims: 0
        };
      }

      const auctionRecord = auctionExpenses[auctionId];
      const tierRecord = rewardTierBreakdowns[auctionId];

      // Update totals
      auctionRecord.total_claims += 1;
      auctionRecord.total_qr_distributed += amount;

      // For auctions <= 118, treat all amounts as legacy regardless of source
      if (auctionId <= 118) {
        // Count as appropriate legacy tier based on amount
        if (amount === 420) {
          tierRecord.legacy_420_qr_claims += 1;
        } else if (amount === 1000) {
          // 1000 QR was also used in legacy auctions
          tierRecord.miniapp_1000_qr_claims += 1;
        } else if (amount === 2000) {
          tierRecord.legacy_2000_qr_claims += 1;
        } else if (amount === 5000) {
          tierRecord.legacy_5000_qr_claims += 1;
        } else if (amount === 100) {
          // 100 QR could be legacy or current, but for auctions <= 118 treat as legacy context
          if (isWeb) {
            tierRecord.web_100_qr_claims += 1;
          } else {
            tierRecord.miniapp_100_qr_claims += 1;
          }
        } else if (amount === 500) {
          // 500 QR for web users in legacy auctions
          tierRecord.web_500_qr_claims += 1;
        }
        
        // Update totals based on detected source
        if (isWeb) {
          auctionRecord.web_claims += 1;
          auctionRecord.web_total_qr += amount;
        } else {
          auctionRecord.miniapp_claims += 1;
          auctionRecord.miniapp_total_qr += amount;
        }
      } else {
        // For auctions > 118, use current reward tier logic
        if (isWeb) {
          // Web claims
          auctionRecord.web_claims += 1;
          auctionRecord.web_total_qr += amount;

          // Web reward tier breakdown
          if (amount === 100) {
            tierRecord.web_100_qr_claims += 1;
          } else if (amount === 500) {
            tierRecord.web_500_qr_claims += 1;
          }
        } else {
          // Mini-app claims
          auctionRecord.miniapp_claims += 1;
          auctionRecord.miniapp_total_qr += amount;

          // Mini-app reward tier breakdown
          if (amount === 100) {
            tierRecord.miniapp_100_qr_claims += 1;
          } else if (amount === 1000) {
            tierRecord.miniapp_1000_qr_claims += 1;
          }
        }
      }

      // Calculate total expense in USD using auction-specific price
      auctionRecord.total_expense_usd = auctionRecord.total_qr_distributed * auctionRecord.qr_price_usd;
    });

    // Update dates to use earliest claim date for each auction
    Object.values(auctionExpenses).forEach(record => {
      record.date = auctionDates[record.auction_id];
    });
    Object.values(rewardTierBreakdowns).forEach(record => {
      record.date = auctionDates[record.auction_id];
    });

    // Calculate averages
    Object.values(auctionExpenses).forEach(record => {
      if (record.web_claims > 0) {
        record.web_avg_qr_per_claim = record.web_total_qr / record.web_claims;
      }
      if (record.miniapp_claims > 0) {
        record.miniapp_avg_qr_per_claim = record.miniapp_total_qr / record.miniapp_claims;
      }
    });

    // Convert to arrays and sort by auction ID
    const sortedAuctionData = Object.values(auctionExpenses).sort((a, b) => a.auction_id - b.auction_id);
    const sortedTierData = Object.values(rewardTierBreakdowns).sort((a, b) => a.auction_id - b.auction_id);

    // Calculate summary statistics
    const totalExpenseUSD = sortedAuctionData.reduce((sum, record) => sum + record.total_expense_usd, 0);
    const totalClaims = sortedAuctionData.reduce((sum, record) => sum + record.total_claims, 0);
    const totalWebClaims = sortedAuctionData.reduce((sum, record) => sum + record.web_claims, 0);
    const totalMiniappClaims = sortedAuctionData.reduce((sum, record) => sum + record.miniapp_claims, 0);
    const totalQRDistributed = sortedAuctionData.reduce((sum, record) => sum + record.total_qr_distributed, 0);

    const avgAuctionExpense = sortedAuctionData.length > 0 ? totalExpenseUSD / sortedAuctionData.length : 0;
    const avgAuctionClaims = sortedAuctionData.length > 0 ? totalClaims / sortedAuctionData.length : 0;

    return NextResponse.json({
      success: true,
      data: {
        auctionExpenses: sortedAuctionData,
        rewardTierBreakdowns: sortedTierData,
        summary: {
          totalExpenseUSD,
          totalClaims,
          totalWebClaims,
          totalMiniappClaims,
          totalQRDistributed,
          avgAuctionExpense,
          avgAuctionClaims,
          defaultQrPriceUSD: DEFAULT_QR_PRICE_USD,
          auctionRange: {
            start: sortedAuctionData[0]?.auction_id || null,
            end: sortedAuctionData[sortedAuctionData.length - 1]?.auction_id || null
          },
          dateRange: {
            start: sortedAuctionData[0]?.date || null,
            end: sortedAuctionData[sortedAuctionData.length - 1]?.date || null
          }
        }
      }
    });

  } catch (error) {
    console.error('Error in daily link visit expenses API:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}