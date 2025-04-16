export const truncateUrl = (url: string, maxLength = 25) => {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + "...";
};

export const getDisplayUrl = (url: string) => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
};

export function formatURL(url: string, today = false, mobile = false, maxWidth?: number) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");
    const path = urlObj.pathname;
    
    // Calculate max path length based on parameters - increased values
    let maxPathLength = today ? mobile ? 18 : 25 : 15;
    
    // Adjust based on domain length, but less aggressively
    if (domain.length > 20) {
      maxPathLength = Math.max(15, maxPathLength - Math.min(5, domain.length - 20));
    }
    
    // Further adjust based on custom maxWidth if provided
    if (maxWidth) {
      // Improved character count estimate based on maxWidth in pixels
      // Using a more conservative average char width of ~6.5px
      const estimatedMaxChars = Math.floor(maxWidth / 6.5) - 2; // -2 for icon with better spacing
      if (estimatedMaxChars > (domain.length + 5)) {
        maxPathLength = Math.min(60, Math.max(15, estimatedMaxChars - domain.length));
      }
    }
    
    // If path doesn't exist or is just "/"
    if (!path || path === "/") {
      return domain;
    }
    
    // If the path is short enough to display fully, don't add ellipsis
    if (path.length <= maxPathLength) {
      return `${domain}${path}`;
    }
    
    // Otherwise, truncate with ellipsis
    return `${domain}${path.slice(0, maxPathLength)}...`;
  } catch {
    return url;
  }
}
