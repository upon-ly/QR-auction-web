import { NextRequest } from "next/server";
import { z } from "zod";
import { sendNotification } from "@/lib/neynar";

const requestSchema = z.object({
  fid: z.number(),
  title: z.string(),
  body: z.string(),
  targetUrl: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const requestJson = await request.json();
  const requestBody = requestSchema.safeParse(requestJson);

  if (requestBody.success === false) {
    return Response.json(
      { success: false, errors: requestBody.error.errors },
      { status: 400 }
    );
  }

  const { fid, title, body, targetUrl } = requestBody.data;
  
  const result = await sendNotification({
    fid,
    title,
    body,
    targetUrl,
  });

  if (result.state === "error") {
    return Response.json(
      { success: false, error: result.error },
      { status: 500 }
    );
  } else if (result.state === "rate_limit") {
    return Response.json(
      { success: false, error: "Rate limited" },
      { status: 429 }
    );
  } else if (result.state === "no_token") {
    return Response.json(
      { success: false, error: "No notification token found for user" },
      { status: 404 }
    );
  }

  return Response.json({ success: true });
}
