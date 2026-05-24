/** Public site & compliance configuration — update for your legal entity before Meta/TikTok review. */
export const SITE = {
  companyName: 'Nexus AI',
  legalName: 'Nexus AI',
  productName: 'NexusAI',
  domain: 'nexus-ai.group',
  website: 'https://nexus-ai.group',
  supportEmail: 'support@nexus-ai.group',
  legalEmail: 'legal@nexus-ai.group',
  privacyEmail: 'privacy@nexus-ai.group',
  salesEmail: 'hello@nexus-ai.group',
  /** Physical address for business verification (update with registered address). */
  address: {
    line1: 'Cairo, Egypt',
    country: 'Egypt',
  },
  foundedYear: 2024,
} as const;

export const PUBLIC_ROUTES = {
  home: '/',
  about: '/about',
  pricing: '/pricing',
  contact: '/contact',
  support: '/support',
  privacy: '/privacy',
  terms: '/terms',
  login: '/login',
  signup: '/signup',
} as const;
