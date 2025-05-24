import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { NextResponse } from 'next/server'

// TODO: add caching (either on vercel with `use cache` or with upstash redis)
export async function GET(request: Request, { params }: { params: Promise<{ auctionId: number }> }) {
	const { auctionId } = await params;
	
	if (auctionId < 62) {
		return new NextResponse('Invalid auction ID, must be a V3 auction', { status: 400 })
	}
	
	const publicClient = createPublicClient({
        chain: base,
        transport: http(`https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`),
    })

    const logs = await publicClient.getContractEvents({
        address: process.env.NEXT_PUBLIC_QRAuctionV3 as `0x${string}`,
		// if we want to use `parseAbi`
		// viem needs a json that is an array
		// not an array inside an `abi` object
        abi: [
            {
                'type': 'event',
                'name': 'AuctionBid',
                'inputs': [
                    {
                        'name': 'tokenId',
                        'type': 'uint256',
                        'indexed': false,
                        'internalType': 'uint256',
                    },
                    {
                        'name': 'bidder',
                        'type': 'address',
                        'indexed': false,
                        'internalType': 'address',
                    },
                    {
                        'name': 'amount',
                        'type': 'uint256',
                        'indexed': false,
                        'internalType': 'uint256',
                    },
                    {
                        'name': 'extended',
                        'type': 'bool',
                        'indexed': false,
                        'internalType': 'bool',
                    },
                    {
                        'name': 'endTime',
                        'type': 'uint256',
                        'indexed': false,
                        'internalType': 'uint256',
                    },
                    {
                        'name': 'urlString',
                        'type': 'string',
                        'indexed': false,
                        'internalType': 'string',
                    },
                    {
                        'name': 'name',
                        'type': 'string',
                        'indexed': false,
                        'internalType': 'string',
                    },
                ],
                'anonymous': false,
            },
        ],
        eventName: 'AuctionBid',
        args: {
            tokenId: BigInt(auctionId),
        },
        fromBlock: 30000000n,
        toBlock: 'latest',
    })

    // Prepare fetch promises for all bidders
    const fetchPromises = logs.map((log) => {
        // Type assertion for the log entry
        const typedLog = log as unknown as {
            args: {
                bidder: string
                urlString: string
                amount: bigint
                name: string
            }
            blockNumber: bigint
        }

        return {
            typedLog,
            fetchPromise: fetch(`https://www.fc-data.xyz/address/${typedLog.args.bidder}`)
                .catch((err) => {
                    console.error('Error fetching farcaster data', err)
                    return null
                })
                .then((res) => res?.json())
                .then((data) => {
                    if (data?.error || !data) {
                        return null
                    }
                    return data
                }),
        }
    })

    // Await all fetch operations at once
    const farcasterResults = await Promise.all(fetchPromises.map((item) => item.fetchPromise))

    // Process all results together
    const parsedBids = fetchPromises
        .map((item, index) => {
            const { typedLog } = item
            const farcasterData = farcasterResults[index]

            return {
                address: typedLog.args.bidder,
                name: farcasterData?.username
                    ? `@${farcasterData.username}`
                    : typedLog.args.name
                      ? typedLog.args.name
                      : `${typedLog.args.bidder.slice(0, 6)}...${typedLog.args.bidder.slice(-4)}`,
                icon: farcasterData?.avatarUrl || null,
                url: typedLog.args.urlString,
                amount: Number(typedLog.args.amount / BigInt(10 ** 6)),
            }
        })
        .sort((a, b) => b.amount - a.amount)

    return new NextResponse(JSON.stringify(parsedBids), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    })
}
