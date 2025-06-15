import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { verifyAdminAuth } from "@/lib/auth";

const f = createUploadthing({
  errorFormatter: (err) => {
    console.log("UploadThing Error:", err.message);
    return { message: err.message };
  },
});

// FileRouter for auction images
export const ourFileRouter = {
  // Auction image uploader - for admin use only
  auctionImageUploader: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
    video: {
      maxFileSize: "32MB", 
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      // Extract auth header from request
      const authHeader = req.headers.get("authorization");
      
      console.log("UploadThing middleware - Auth header:", authHeader ? "Present" : "Missing");
      console.log("UploadThing middleware - Auth header length:", authHeader?.length || 0);
      
      // Verify admin authentication using Privy JWT
      const authResult = await verifyAdminAuth(authHeader);
      
      console.log("UploadThing middleware - Auth result:", authResult);
      
      if (!authResult.isValid) {
        throw new UploadThingError(`Unauthorized: ${authResult.error || 'Authentication required'}`);
      }

      // Return verified user ID as metadata
      return { userId: authResult.userId };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code RUNS ON YOUR SERVER after upload
      console.log("Auction image upload complete for admin:", metadata.userId);
      console.log("file url", file.url);

      // !!! Whatever is returned here is sent to the clientside `onClientUploadComplete` callback
      return { uploadedBy: metadata.userId };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter; 