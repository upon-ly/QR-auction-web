export type AuctionType = {
  tokenId: bigint;
  startTime: bigint;
  endTime: bigint;
};

export type AuctionState = {
  auctions: AuctionType[];
  historicalLoaded: boolean;
};

export type AuctionAction =
  | { type: "INITIALIZE"; auctions: AuctionType[] }
  | { type: "ADD_EVENT"; auction: AuctionType };

function mergeAndSort(
  current: AuctionType[],
  newAuctions: AuctionType[]
): AuctionType[] {
  const combined = [...current];
  newAuctions.forEach((newAuction) => {
    // Avoid duplicates based on tokenId
    if (!combined.some((item) => item.tokenId === newAuction.tokenId)) {
      combined.push(newAuction);
    }
  });
  // Sort by tokenId (or another property like startTime)
  return combined.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
}

export function auctionReducer(
  state: AuctionState,
  action: AuctionAction
): AuctionState {
  switch (action.type) {
    case "INITIALIZE": {
      const merged = mergeAndSort(state.auctions, action.auctions);
      return { auctions: merged, historicalLoaded: true };
    }
    case "ADD_EVENT": {
      // You might want to buffer events if historical data isn’t loaded yet.
      // For this example, we merge immediately.
      const merged = mergeAndSort(state.auctions, [action.auction]);
      return { ...state, auctions: merged };
    }
    default:
      return state;
  }
}
