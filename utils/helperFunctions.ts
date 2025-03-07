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
