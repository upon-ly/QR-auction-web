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
      { error: "API key not configured" },
      {
        status: 500,
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
    const data = await res.json();
    console.log(data);
    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*", // Or specify your frontend domain
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch preview data" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*", // Or specify your frontend domain
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }
}
