import type { MerchantRule } from "./types";

/**
 * Built-in merchant → category-name rules (fast path, no AI).
 * Matched as substrings against merchantKey. Category names must exist in the
 * user's seeded categories; unknown names fall through to AI/Other.
 * User-specific merchant_rules (incl. learned corrections) take precedence.
 */
export const BUILTIN_RULES: [pattern: string, category: string, subcategory?: string][] = [
  // transport & rides
  ["uber eats", "Dining", "Delivery"], // before "uber"
  ["uber", "Transport", "Rideshare"],
  ["lyft", "Transport", "Rideshare"],
  ["ola cabs", "Transport", "Rideshare"], ["ola", "Transport", "Rideshare"],
  ["rapido", "Transport", "Rideshare"],
  ["shell", "Transport", "Fuel"], ["chevron", "Transport", "Fuel"],
  ["indian oil", "Transport", "Fuel"], ["hpcl", "Transport", "Fuel"], ["petrol", "Transport", "Fuel"],
  ["parking", "Transport", "Parking"], ["metro", "Transport", "Transit"], ["irctc", "Travel", "Train"],
  // groceries & retail
  ["costco", "Groceries"], ["walmart", "Groceries"], ["target", "Shopping"],
  ["whole foods", "Groceries"], ["trader joe", "Groceries"], ["kroger", "Groceries"],
  ["safeway", "Groceries"], ["aldi", "Groceries"], ["instacart", "Groceries", "Delivery"],
  ["blinkit", "Groceries", "Delivery"], ["bigbasket", "Groceries", "Delivery"],
  ["zepto", "Groceries", "Delivery"], ["dmart", "Groceries"], ["reliance fresh", "Groceries"],
  ["amazon fresh", "Groceries", "Delivery"],
  ["amazon", "Shopping", "Online"], ["amzn", "Shopping", "Online"],
  ["flipkart", "Shopping", "Online"], ["myntra", "Shopping", "Clothing"],
  ["ebay", "Shopping", "Online"], ["etsy", "Shopping", "Online"],
  ["ikea", "Shopping", "Home"], ["best buy", "Shopping", "Electronics"],
  // dining
  ["swiggy", "Dining", "Delivery"], ["zomato", "Dining", "Delivery"],
  ["doordash", "Dining", "Delivery"], ["grubhub", "Dining", "Delivery"],
  ["mcdonald", "Dining", "Fast food"], ["starbucks", "Dining", "Coffee"],
  ["dominos", "Dining", "Fast food"], ["subway", "Dining", "Fast food"],
  ["chipotle", "Dining", "Fast food"], ["kfc", "Dining", "Fast food"],
  ["restaurant", "Dining"], ["cafe", "Dining", "Coffee"],
  // subscriptions & digital
  ["netflix", "Subscriptions", "Streaming"], ["spotify", "Subscriptions", "Music"],
  ["youtube premium", "Subscriptions", "Streaming"], ["hulu", "Subscriptions", "Streaming"],
  ["disney", "Subscriptions", "Streaming"], ["hbo", "Subscriptions", "Streaming"],
  ["prime video", "Subscriptions", "Streaming"], ["apple.com bill", "Subscriptions", "Apple"],
  ["apple music", "Subscriptions", "Music"], ["icloud", "Subscriptions", "Apple"],
  ["apple", "Shopping", "Electronics"],
  ["google one", "Subscriptions", "Storage"], ["google storage", "Subscriptions", "Storage"],
  ["google play", "Entertainment", "Apps"], ["google", "Subscriptions", "Google"],
  ["openai", "Subscriptions", "Software"], ["anthropic", "Subscriptions", "Software"],
  ["github", "Subscriptions", "Software"], ["dropbox", "Subscriptions", "Storage"],
  ["adobe", "Subscriptions", "Software"], ["microsoft 365", "Subscriptions", "Software"],
  ["audible", "Subscriptions", "Books"], ["kindle", "Entertainment", "Books"],
  ["patreon", "Subscriptions"], ["substack", "Subscriptions", "News"],
  ["nytimes", "Subscriptions", "News"], ["gym", "Health", "Fitness"],
  ["planet fitness", "Health", "Fitness"], ["cult fit", "Health", "Fitness"],
  // travel
  ["airbnb", "Travel", "Lodging"], ["booking com", "Travel", "Lodging"],
  ["booking.com", "Travel", "Lodging"], ["expedia", "Travel", "Lodging"],
  ["marriott", "Travel", "Lodging"], ["hilton", "Travel", "Lodging"],
  ["hyatt", "Travel", "Lodging"], ["oyo", "Travel", "Lodging"],
  ["makemytrip", "Travel"], ["goibibo", "Travel"], ["cleartrip", "Travel"],
  ["delta air", "Travel", "Flights"], ["united air", "Travel", "Flights"],
  ["american airlines", "Travel", "Flights"], ["southwest", "Travel", "Flights"],
  ["air india", "Travel", "Flights"], ["indigo", "Travel", "Flights"],
  ["vistara", "Travel", "Flights"], ["emirates", "Travel", "Flights"],
  ["qatar airways", "Travel", "Flights"], ["lufthansa", "Travel", "Flights"],
  ["ryanair", "Travel", "Flights"], ["easyjet", "Travel", "Flights"],
  ["airlines", "Travel", "Flights"], ["airways", "Travel", "Flights"],
  ["hotel", "Travel", "Lodging"],
  // utilities & housing
  ["electric", "Utilities", "Electricity"], ["electricity", "Utilities", "Electricity"],
  ["water bill", "Utilities", "Water"], ["gas bill", "Utilities", "Gas"],
  ["internet", "Utilities", "Internet"], ["broadband", "Utilities", "Internet"],
  ["comcast", "Utilities", "Internet"], ["xfinity", "Utilities", "Internet"],
  ["verizon", "Utilities", "Phone"], ["at t", "Utilities", "Phone"],
  ["t mobile", "Utilities", "Phone"], ["airtel", "Utilities", "Phone"],
  ["jio", "Utilities", "Phone"], ["vodafone", "Utilities", "Phone"],
  ["rent", "Housing", "Rent"], ["mortgage", "Housing", "Mortgage"],
  ["insurance", "Fees", "Insurance"], ["hoa", "Housing", "Fees"],
  // health / entertainment / income / fees
  ["pharmacy", "Health"], ["cvs", "Health", "Pharmacy"], ["walgreens", "Health", "Pharmacy"],
  ["apollo", "Health", "Pharmacy"], ["hospital", "Health"], ["clinic", "Health"],
  ["cinema", "Entertainment", "Movies"], ["pvr", "Entertainment", "Movies"],
  ["bookmyshow", "Entertainment", "Movies"], ["steam", "Entertainment", "Games"],
  ["playstation", "Entertainment", "Games"], ["ticketmaster", "Entertainment", "Events"],
  ["salary", "Income", "Salary"], ["payroll", "Income", "Salary"],
  ["interest", "Income", "Interest"], ["dividend", "Income", "Dividends"], ["refund", "Income", "Refund"],
  ["atm fee", "Fees", "Bank"], ["overdraft", "Fees", "Bank"], ["late fee", "Fees"],
];

export interface RuleMatch {
  categoryName: string;
  subcategory?: string;
  pattern: string;
}

/** Longest-pattern-wins substring match against a merchant key/name. */
export function matchBuiltin(merchantKeyOrName: string): RuleMatch | null {
  const hay = merchantKeyOrName.toLowerCase();
  let best: RuleMatch | null = null;
  for (const [pattern, categoryName, subcategory] of BUILTIN_RULES) {
    if (hay.includes(pattern) && (!best || pattern.length > best.pattern.length)) {
      best = { categoryName, subcategory, pattern };
    }
  }
  return best;
}

/** User/learned rules (from merchant_rules table) — highest priority. */
export function matchUserRules(
  merchantKeyOrName: string,
  rules: MerchantRule[]
): MerchantRule | null {
  const hay = merchantKeyOrName.toLowerCase();
  let best: MerchantRule | null = null;
  for (const r of rules) {
    if (hay.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best;
}
