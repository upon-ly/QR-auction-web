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

export function formatURL(url: string, today = false) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");
    const path = urlObj.pathname;
    
    // If path doesn't exist or is just "/"
    if (!path || path === "/") {
      return domain;
    }
    
    // Determine maximum path length based on today parameter
    const maxPathLength = today ? 26 : 6;
    
    // If the path is short enough to display fully, don't add ellipsis
    if (path.length <= maxPathLength) {
      return `${domain}${path}`;
    }
    
    // Otherwise, truncate with ellipsis
    return `${domain}${path.slice(0, maxPathLength-3)}...`;
  } catch {
    return url;
  }
}
