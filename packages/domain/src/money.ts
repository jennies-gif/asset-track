export const CENT_SCALE = 2;
export const QUANTITY_SCALE = 6;
export const RATE_SCALE = 4;

const quantityFactor = 10n ** BigInt(QUANTITY_SCALE);
const rateFactor = 10n ** BigInt(RATE_SCALE);

export function parseDecimalToScaledInt(value: unknown, scale: number): bigint {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid decimal: ${raw}`);
  }

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
  const nextDigit = fraction[scale] ? Number(fraction[scale]) : 0;
  let result = BigInt(whole || "0") * 10n ** BigInt(scale) + BigInt(padded || "0");

  if (nextDigit >= 5) result += 1n;
  return negative ? -result : result;
}

export function scaledIntToDecimal(value: bigint | number | string, scale: number): string {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const factor = 10n ** BigInt(scale);
  const whole = absolute / factor;
  const fraction = String(absolute % factor).padStart(scale, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

export function roundDivide(numerator: bigint, denominator: bigint): bigint {
  const half = denominator / 2n;
  if (numerator >= 0n) return (numerator + half) / denominator;
  return (numerator - half) / denominator;
}

export function calculateMoneyFromQuantity(quantity: string, priceCents: string, fxRate = "1"): bigint {
  const quantityUnits = parseDecimalToScaledInt(quantity, QUANTITY_SCALE);
  const priceMinor = parseDecimalToScaledInt(priceCents, CENT_SCALE);
  const rateUnits = parseDecimalToScaledInt(fxRate, RATE_SCALE);
  return roundDivide(quantityUnits * priceMinor * rateUnits, quantityFactor * rateFactor);
}

export function formatPercent(basisPoints: bigint | number): string {
  const value = Number(basisPoints) / 100;
  if (!Number.isFinite(value)) return "暂无数据";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
