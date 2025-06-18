import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing URL parameter" },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*", // Or specify your frontend domain
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }

  const API_KEY = process.env.NEXT_LINK_PREVIEW_API_KEY;
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      {
        status: 503,
        headers: {
          "Access-Control-Allow-Origin": "*", // Or specify your frontend domain
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }

  try {
    const res = await fetch(
      `https://api.linkpreview.net/?key=${API_KEY}&q=${encodeURIComponent(
        url
      )}`,
      { next: { revalidate: 60 } }
    );

    if (!res.ok) {
      // Handle different API response codes
      if (res.status === 404) {
        return NextResponse.json(
          { error: "URL not found" },
          {
            status: 404,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS", 
              "Access-Control-Allow-Headers": "Content-Type",
            },
          }
        );
      } else if (res.status === 429) {
        return NextResponse.json(
          { error: "Service temporarily unavailable" },
          {
            status: 503,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type", 
            },
          }
        );
      } else if (res.status >= 400 && res.status < 500) {
        return NextResponse.json(
          { error: "Invalid URL" },
          {
            status: 422,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          }
        );
      } else {
        return NextResponse.json(
          { error: "Service temporarily unavailable" },
          {
            status: 503,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
          }
        );
      }
    }

    const data = await res.json();
    console.log(data);
    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*", // Or specify your frontend domain
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error('Error in OG route:', error);
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      {
        status: 503,
        headers: {
          "Access-Control-Allow-Origin": "*", // Or specify your frontend domain
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }
}
