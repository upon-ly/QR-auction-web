/**
 * Application Constants
 * 
 * Centralized location for all application constants including admin addresses.
 * Import this file anywhere you need to check admin authorization.
 */

// List of authorized admin wallet addresses (lowercase for easy comparison)
export const ADMIN_ADDRESSES = [
  "0xa8bea5bbf5fefd4bf455405be4bb46ef25f33467",
  "0x09928cebb4c977c5e5db237a2a2ce5cd10497cb8", 
  "0x5b759ef9085c80cca14f6b54ee24373f8c765474",
  "0xf7d4041e751e0b4f6ea72eb82f2b200d278704a4",
  "0xc571b5ffc48895d5b0997f52a30945ff45a011d0"
];

/**
 * Check if a wallet address is an admin
 * @param address - Wallet address to check
 * @returns true if address is an admin, false otherwise
 */
export function isAdminAddress(address: string): boolean {
  return ADMIN_ADDRESSES.includes(address.toLowerCase());
}

/**
 * Get authorization from request header and validate admin access
 * @param authHeader - Authorization header from request
 * @returns admin address if authorized, null otherwise
 */
export function getAuthorizedAdmin(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const address = authHeader.substring(7).toLowerCase(); // Remove 'Bearer '
  return isAdminAddress(address) ? address : null;
} 