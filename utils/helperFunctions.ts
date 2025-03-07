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

export function formatURL(url: string) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace("www.", "");
    const path = urlObj.pathname;

    // If there's a path, show first 5 characters + ellipsis
    if (path && path.length > 1) {
      // Check if path exists and is not just "/"
      return `${domain}${path.slice(0, 6)}...`;
    }

    return domain;
  } catch {
    return url;
  }
}
