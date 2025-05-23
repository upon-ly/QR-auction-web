/**
 * Map of auction IDs to known winner image URLs
 * Used by multiple components to display consistent auction winner images
 */
export const auctionImageOverrides: Record<string, string> = {
  "1": "https://i.imgur.com/aZfUcoo.png",
  "4": "https://i.imgur.com/DkzUJvK.png",
  "5": "https://i.imgur.com/3KoEvNG.png",
  "7": "https://i.imgur.com/fzojQUs.png",
  "9": "https://i.imgur.com/Ryd5FD6.png",
  "13": "https://i.imgur.com/RcjPf8D.png",
  "14": "https://i.imgur.com/4KcwIzj.png",
  "15": "https://i.imgur.com/jyo2f0H.jpeg",
  "20": "https://i.imgur.com/8qNqYIV.png",
  "22": "https://i.imgur.com/21yjB2x.png",
  "23": "https://i.imgur.com/5gCWL3S.png",
  "24": "https://i.imgur.com/Q5UspzS.png",
  "25": "https://i.imgur.com/no5pC8v.png",
  "27": "https://i.postimg.cc/2SgbbqFr/qr-27-winner.png",
  "29": "https://i.postimg.cc/zDg3CxBW/elon5050.png",
  "30": "https://i.postimg.cc/tRkFGkKL/Group-424.png",
  "32": "https://i.postimg.cc/tRkFGkKL/Group-424.png",
  "33": "https://i.postimg.cc/mhWtNxTw/34winner.png",
  "34": "https://i.postimg.cc/wBfV58jL/35winner.png",
  "37": "https://i.postimg.cc/RZfJ9hsX/winner37.jpg",
  "39": "https://i.postimg.cc/rpxzhzbX/winner39.png",
  "42": "https://i.postimg.cc/bwGJ6JKy/42winner.jpg",
  "43": "https://i.postimg.cc/wTDHNwnp/43winner.jpg",
  "45": "https://i.postimg.cc/DzRKLWrW/45winner.jpg",
  "46": "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWNvYms5bXdremd6MjF4aTR0ZW4zYjB0NmlobWk1dzk1aGRlb3VzYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/RFEiTqRUBaKHLpO8Lv/giphy.gif",
  "47": "https://i.postimg.cc/RFDdTkkr/47winner.jpg",
  "48": "https://i.postimg.cc/zBwNND8N/48winner.jpg",
  "55": "https://i.postimg.cc/NfXMQDtR/55winner.jpg",
  "56": "https://i.postimg.cc/NfXMQDtR/55winner.jpg",
  "57": "https://i.postimg.cc/GhFSqpM7/57winner.jpg",
  "59": "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExYW1rY216bmtidnAwcDgzcHYwdTNmYTB2dDhnM3BxbW43cDZ5bmV3MiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ZmCWjB3utyyAN61pAj/giphy.gif",
  "60": "https://i.ibb.co/JWWcQyJ4/60winner.jpg",
  "63": "https://i.postimg.cc/KzBYyrMy/63winner.jpg",
  "64": "https://i.postimg.cc/kMyLJhFj/64winner.jpg",
  "65": "https://i.postimg.cc/wTDHNwnp/43winner.jpg",
  "67": "https://i.postimg.cc/3Jmz8MzD/67winner.jpg",
  "69": "https://i.postimg.cc/02dgY6j9/69winner.jpg",
  "70": "https://i.postimg.cc/0Nh72ypw/70winner.jpg",
  "71": "https://i.postimg.cc/KYY81XWF/71winner.jpg",
  "72": "https://i.postimg.cc/g2G9vWYN/72winner.jpg",
  "73": "https://i.postimg.cc/0NsMLV9j/73winner.jpg",
  "74": "https://i.postimg.cc/85DwR5m5/74winner.jpg",
  "75": "https://i.postimg.cc/85DwR5m5/74winner.jpg",
  "76": "https://i.postimg.cc/85DwR5m5/74winner.jpg",
  "77": "https://gwum763zx9.ufs.sh/f/xTE4HUVGCg4nExWMi4v83tMP5l2AzXYsrIBd7hNc1eLqZuCG",
  "78": "https://i.postimg.cc/B615SLjn/78winner.jpg",
  "79": "https://i.postimg.cc/B615SLjn/78winner.jpg"
};

/**
 * Helper function to check if a URL is a video URL
 */
export function isVideoUrl(url: string): boolean {
  // Check for common video domains or extensions
  return url.includes('gwum763zx9') || 
         url.includes('.mp4') || 
         url.includes('.webm') || 
         url.includes('.ogg');
}

/**
 * Helper function to get an image for a specific auction ID
 * Falls back to default image if no override exists
 */
export function getAuctionImage(auctionId: number | string, defaultImage?: string): string | null {
  const id = typeof auctionId === 'number' ? auctionId.toString() : auctionId;
  
  // If there's an override, use it
  if (auctionImageOverrides[id]) {
    return auctionImageOverrides[id];
  }
  
  // If a default image was provided, use it
  if (defaultImage) {
    return defaultImage;
  }
  
  // Otherwise return null to allow the Link Preview API to be used
  return null;
} 