import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function useEthPrice() {
  const { data, error } = useSWR(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    fetcher,
    { refreshInterval: 60000 } // Refresh every minute
  );

  return {
    ethPrice: data,
    isLoading: !error && !data,
    isError: error,
  };
}
