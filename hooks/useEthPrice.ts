import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface EthPriceResponse {
  ethereum: {
    usd: number;
  };
}

export default function useEthPrice() {
  const { data, error } = useSWR<EthPriceResponse>(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    fetcher,
    {
      refreshInterval: 60000, // Refresh every minute
      dedupingInterval: 60000, // Prevent duplicate requests within 1 minute
      revalidateOnFocus: false, // Disable revalidation when the window gains focus
    }
  );

  return {
    ethPrice: data,
    isLoading: !error && !data,
    isError: error,
  };
}
