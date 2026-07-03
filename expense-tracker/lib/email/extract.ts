/** Email → transaction extraction. Operates on metadata + snippet/plain text.
 *  SECURITY: callers must never persist raw bodies — only the structured
 *  RawTransaction this module returns is stored. */
import type { RawTransaction } from "../engine/types";
import { parseAmount, parseDate, detectCurrency } from "../engine/normalize";

export interface EmailMeta {
  id: string;              // provider message id → externalId (dedupe)
  from: string;            // "Amazon.in <auto-confirm@amazon.in>"
  subject: string;
  date: string;            // header date
  snippet: string;         // short plain-text excerpt / body text
}

const FINANCIAL_SUBJECT =
  /(receipt|invoice|order|payment|paid|purchase|charged|billing|bill\b|subscription|renewal|booking|reservation|itinerary|statement|debited|credited|transaction|confirmation)/i;
const FINANCIAL_SENDER =
  /(no-?reply|receipt|billing|invoice|order|payment|confirm|alert|statement|bank|card)/i;
const NEGATIVE =
  /(newsletter|digest|webinar|password|verify your|security alert(?!.*charge)|sale\b|% off|offer inside|unsubscribe preferences)/i;

export function isFinancialEmail(m: EmailMeta): boolean {
  if (NEGATIVE.test(m.subject)) return false;
  return FINANCIAL_SUBJECT.test(m.subject) || FINANCIAL_SENDER.test(m.from);
}

/** merchant-specific extraction tweaks; extended at runtime by merchant_rules */
const KNOWN_SENDERS: [re: RegExp, merchant: string, categoryHint?: string][] = [
  [/amazon/i, "Amazon", "Shopping"],
  [/uber\b|uber\.com/i, "Uber", "Transport"],
  [/lyft/i, "Lyft", "Transport"],
  [/walmart/i, "Walmart", "Groceries"],
  [/costco/i, "Costco", "Groceries"],
  [/target\.com/i, "Target", "Shopping"],
  [/netflix/i, "Netflix", "Subscriptions"],
  [/spotify/i, "Spotify", "Subscriptions"],
  [/apple\.com|itunes/i, "Apple", "Subscriptions"],
  [/google\.com|google pay|googlepay/i, "Google", "Subscriptions"],
  [/airbnb/i, "Airbnb", "Travel"],
  [/booking\.com/i, "Booking.com", "Travel"],
  [/expedia/i, "Expedia", "Travel"],
  [/swiggy/i, "Swiggy", "Dining"],
  [/zomato/i, "Zomato", "Dining"],
  [/doordash/i, "DoorDash", "Dining"],
  [/(delta|united|american ?airlines|southwest|indigo|air ?india|vistara|emirates|qatar ?airways|lufthansa)/i, "$1", "Travel"],
  [/(marriott|hilton|hyatt|oyo)/i, "$1", "Travel"],
];

const AMOUNT_RE =
  /(?:total|amount|charged|paid|payment of|debited(?:\s*(?:by|for|with))?|fare|price)[^\d₹$€£¥-]{0,20}([₹$€£¥]\s?\d[\d,.]*\.?\d{0,2}|\d[\d,.]*\.?\d{0,2}\s?(?:USD|EUR|GBP|INR|JPY|AUD|CAD|SGD|AED))/i;
const BARE_AMOUNT_RE = /([₹$€£¥]\s?\d[\d,.]*\.?\d{0,2})/;
const ORDER_RE =
  /(?:order|invoice|booking|confirmation|reference|receipt)\s*(?:number|no\.?|id|#)?[:\s#]*([A-Z0-9][A-Z0-9-]{5,24})/i;
const CREDIT_HINT = /(refund|credited|cashback|reversal|payment received)/i;

function senderName(from: string): string {
  const m = from.match(/^"?([^"<]+)"?\s*</);
  if (m) return m[1].trim();
  const dom = from.match(/@([a-z0-9-]+)\./i);
  return dom ? dom[1][0].toUpperCase() + dom[1].slice(1) : from;
}

/** Extract a transaction from a financial email; null when no amount found. */
export function extractFromEmail(m: EmailMeta): RawTransaction | null {
  if (!isFinancialEmail(m)) return null;
  const text = `${m.subject}\n${m.snippet}`;

  let merchant = senderName(m.from);
  let categoryHint: string | undefined;
  for (const [re, name, hint] of KNOWN_SENDERS) {
    const match = (m.from.match(re) ?? m.subject.match(re));
    if (match) {
      merchant = name === "$1" ? match[1].replace(/\b\w/g, (c) => c.toUpperCase()) : name;
      categoryHint = hint;
      break;
    }
  }

  const am = text.match(AMOUNT_RE) ?? text.match(BARE_AMOUNT_RE);
  if (!am) return null;
  const value = parseAmount(am[1]);
  if (value === null || value === 0) return null;
  const amount = CREDIT_HINT.test(text) ? Math.abs(value) : -Math.abs(value);

  const date = parseDate(m.date) ?? new Date().toISOString().slice(0, 10);
  const order = text.match(ORDER_RE);

  return {
    merchant,
    description: m.subject.slice(0, 140),
    amount,
    currency: detectCurrency(am[1] + " " + text),
    date,
    orderId: order?.[1],
    externalId: `email:${m.id}`,
    categoryHint,
    source: "email",
  };
}
