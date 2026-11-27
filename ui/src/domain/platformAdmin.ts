/**
 * The engine's refusal of a page that every organization on the installation
 * shares — its machines, its upgrades, the servers it is connected to — to an
 * administrator of one organization. It names the account's id, which the
 * operator adds to METIS_PLATFORM_ADMINS; the page says that plainly instead
 * of showing the refusal.
 */
export interface PlatformAdminRefusal {
  /** The signed-in account's id, as the refusal names it; '' if it does not. */
  accountId: string;
}

const ACCOUNT_ID = /account id,?\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** The refusal in message, or null for any other error. */
export function platformAdminRefusal(message: string | undefined | null): PlatformAdminRefusal | null {
  if (!message || !message.includes('METIS_PLATFORM_ADMINS')) return null;
  return { accountId: ACCOUNT_ID.exec(message)?.[1] ?? '' };
}
