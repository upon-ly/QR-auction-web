import { useState, useEffect } from 'react';

interface SocialLinks {
  quoteTweetUrl: string | null;
  quoteCastUrl: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export function useSocialLinks() {
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({
    quoteTweetUrl: null,
    quoteCastUrl: null,
    updatedAt: null,
    updatedBy: null
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSocialLinks = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/social-links');
        
        if (response.ok) {
          const data = await response.json();
          setSocialLinks({
            quoteTweetUrl: data.quoteTweetUrl,
            quoteCastUrl: data.quoteCastUrl,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy
          });
        } else {
          setError('Failed to fetch social links');
        }
      } catch (err) {
        console.error('Error fetching social links:', err);
        setError('Error fetching social links');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSocialLinks();
  }, []);

  return { socialLinks, isLoading, error };
} 