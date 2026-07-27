// Keyword -> category starter rules. Households can add/edit their own via
// the category_rules table (see app/api/rules). Matching is case-insensitive
// substring matching against the transaction description/merchant, and rules
// are checked in order, first match wins, so put more specific keywords first.

export const DEFAULT_RULES: { keyword: string; category: string }[] = [
  // Groceries
  { keyword: 'trader joe', category: 'Groceries' },
  { keyword: 'whole foods', category: 'Groceries' },
  { keyword: 'kroger', category: 'Groceries' },
  { keyword: 'safeway', category: 'Groceries' },
  { keyword: 'costco', category: 'Groceries' },
  { keyword: 'publix', category: 'Groceries' },
  { keyword: 'aldi', category: 'Groceries' },
  { keyword: 'grocery', category: 'Groceries' },

  // Dining
  { keyword: 'starbucks', category: 'Dining' },
  { keyword: 'coffee', category: 'Dining' },
  { keyword: 'doordash', category: 'Dining' },
  { keyword: 'uber eats', category: 'Dining' },
  { keyword: 'grubhub', category: 'Dining' },
  { keyword: 'restaurant', category: 'Dining' },
  { keyword: 'chipotle', category: 'Dining' },
  { keyword: 'mcdonald', category: 'Dining' },
  { keyword: 'pizza', category: 'Dining' },
  { keyword: 'bar & grill', category: 'Dining' },

  // Transportation
  { keyword: 'uber', category: 'Transportation' },
  { keyword: 'lyft', category: 'Transportation' },
  { keyword: 'shell', category: 'Transportation' },
  { keyword: 'chevron', category: 'Transportation' },
  { keyword: 'exxon', category: 'Transportation' },
  { keyword: 'gas station', category: 'Transportation' },
  { keyword: 'parking', category: 'Transportation' },

  // Subscriptions / entertainment
  { keyword: 'netflix', category: 'Subscriptions' },
  { keyword: 'spotify', category: 'Subscriptions' },
  { keyword: 'hulu', category: 'Subscriptions' },
  { keyword: 'disney+', category: 'Subscriptions' },
  { keyword: 'amazon prime', category: 'Subscriptions' },
  { keyword: 'apple.com/bill', category: 'Subscriptions' },

  // Shopping
  { keyword: 'amazon', category: 'Shopping' },
  { keyword: 'target', category: 'Shopping' },
  { keyword: 'walmart', category: 'Shopping' },
  { keyword: 'best buy', category: 'Shopping' },

  // Health
  { keyword: 'pharmacy', category: 'Health' },
  { keyword: 'cvs', category: 'Health' },
  { keyword: 'walgreens', category: 'Health' },

  // Home / utilities
  { keyword: 'home depot', category: 'Home' },
  { keyword: 'lowe', category: 'Home' },
];

export interface Rule {
  keyword: string;
  category: string;
}

export function categorize(description: string, rules: Rule[]): string {
  const text = description.toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) {
      return rule.category;
    }
  }
  return 'Uncategorized';
}
