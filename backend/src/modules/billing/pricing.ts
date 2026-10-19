export const PRICING = {
  currency: "USD",
  K_GO: {
    id: "K-GO",
    price: "39.95",
    renders: 3,
    features: [
      "3 mix and master sessions per month",
      "Browser-based mixer, plugins, buses, and sends",
      "Project export tools",
    ],
  },
  K_PRO: {
    id: "K-PRO",
    price: "59.95",
    renders: 6,
    features: [
      "6 mix and master sessions per month",
      "Browser-based mixer, plugins, buses, and sends",
      "Project export tools",
    ],
  },
} as const;

export type Tier = keyof typeof PRICING;

export function getTier(tier: string) {
  if (tier === "K_GO" || tier === "K_PRO") return PRICING[tier];
  return undefined;
}
