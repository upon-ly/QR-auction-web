import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    // Read the farcaster.json file from the .well-known directory
    const filePath = path.join(process.cwd(), ".well-known", "farcaster.json");

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Farcaster domain manifest not found" },
        { status: 404 }
      );
    }

    // Read and parse the file
    const fileContent = fs.readFileSync(filePath, "utf8");
    const manifestData = JSON.parse(fileContent);

    // Return the manifest data with the correct content type
    return NextResponse.json(manifestData);
  } catch (error) {
    console.error("Error serving farcaster domain manifest:", error);
    return NextResponse.json(
      { error: "Error serving farcaster domain manifest" },
      { status: 500 }
    );
  }
}
