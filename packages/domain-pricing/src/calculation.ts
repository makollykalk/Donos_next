import {
  ExactMoneyRatioSchema,
  PricingCalculationInputSchema,
  PricingComboCostInputSchema,
  PricingQuoteSchema,
} from '@donos/contracts';
import type {
  ExactMoneyRatio,
  PricingCalculationInput,
  PricingComboCostInput,
  PricingQuote,
} from '@donos/contracts';
import {
  add, compare, decimalFraction, div, exactMoneyFraction, exactMoneyRatio, fraction,
  max, moneyString, mul, priceCeilToCent, sub, type Fraction, zero,
} from './exact.js';
import type { PricingCostComponent } from '@donos/contracts';

/** Scale recipe costs to one sale while keeping App 02 per-sale packaging unchanged. */
export function scalePricingVariantCostComponents(
  recipeComponents: PricingCostComponent[],
  app02PackagingComponents: PricingCostComponent[],
  quantityPerSale: string,
): PricingCostComponent[] {
  const multiplier = decimalFraction(quantityPerSale);
  return [
    ...recipeComponents.map((component) => ({
      ...component,
      costPerFinalUnitExact: exactMoneyRatio(mul(exactMoneyFraction(component.costPerFinalUnitExact), multiplier)),
    })),
    ...app02PackagingComponents,
  ];
}

export type PricingCalculationErrorCode =
  | 'INVALID_TARGET'
  | 'NON_POSITIVE_DENOMINATOR'
  | 'INVALID_RATE_BASE'
  | 'MISSING_COST_COMPONENT'
  | 'NUMERIC_RANGE';

export class PricingCalculationError extends Error {
  constructor(readonly code: PricingCalculationErrorCode) {
    super(code);
    this.name = 'PricingCalculationError';
  }
}

const one = fraction(1n);
const addAll = (values: Fraction[]): Fraction => values.reduce((total, value) => add(total, value), zero());
const maxFraction = (values: Fraction[]): Fraction => values.reduce((largest, value) => max(largest, value), zero());
const ratioValue = (value: ExactMoneyRatio): Fraction => exactMoneyFraction(ExactMoneyRatioSchema.parse(value));

const ensureRange = (value: Fraction): Fraction => {
  if (value.n.toString().replace('-', '').length > 256 || value.d.toString().length > 256) {
    throw new PricingCalculationError('NUMERIC_RANGE');
  }
  return value;
};
const moneyOutput = (value: Fraction): string => {
  const result = moneyString(value);
  if (result.split('.')[0]!.replace('-', '').length > 26) throw new PricingCalculationError('NUMERIC_RANGE');
  return result;
};
const decimalOutput = (value: Fraction): string => {
  const result = moneyString(value);
  if (result.split('.')[0]!.replace('-', '').length > 18) throw new PricingCalculationError('NUMERIC_RANGE');
  return result;
};
const exactMoneyOutput = (value: Fraction): ExactMoneyRatio => {
  const result = exactMoneyRatio(value);
  if (result.numerator.length > 256 || result.denominator.length > 256) throw new PricingCalculationError('NUMERIC_RANGE');
  return result;
};

const sumRates = (rates: PricingCalculationInput['rates'], kind: 'fee' | 'tax' | 'discount', mode: 'percentage' | 'fixed') =>
  rates.filter((rate) => rate.kind === kind && rate.mode === mode);

const metrics = (price: Fraction, ingredients: Fraction, totalCost: Fraction, rates: PricingCalculationInput['rates']) => {
  const percentDiscount = addAll(sumRates(rates, 'discount', 'percentage').map((rate) => decimalFraction(rate.value)));
  const fixedDiscount = addAll(sumRates(rates, 'discount', 'fixed').map((rate) => decimalFraction(rate.value)));
  const netRevenue = sub(mul(sub(one, percentDiscount), price), fixedDiscount);
  if (compare(netRevenue, zero()) <= 0) return null;

  const percentageCharges = rates.filter((rate) => (rate.kind === 'fee' || rate.kind === 'tax') && rate.mode === 'percentage');
  const variableCharges = addAll(percentageCharges.map((rate) => mul(
    rate.rateBase === 'list_price' ? price : netRevenue,
    decimalFraction(rate.value),
  )));
  const fixedCharges = addAll(sumRates(rates, 'fee', 'fixed').map((rate) => decimalFraction(rate.value))
    .concat(sumRates(rates, 'tax', 'fixed').map((rate) => decimalFraction(rate.value))));
  const contribution = sub(sub(sub(netRevenue, totalCost), variableCharges), fixedCharges);
  return {
    netRevenue,
    contributionMargin: div(contribution, netRevenue),
    cmv: div(ingredients, netRevenue),
  };
};

const minimumForMargin = (
  target: Fraction,
  ingredientsAndOther: Fraction,
  rates: PricingCalculationInput['rates'],
): Fraction => {
  const percentDiscount = addAll(sumRates(rates, 'discount', 'percentage').map((rate) => decimalFraction(rate.value)));
  const fixedDiscount = addAll(sumRates(rates, 'discount', 'fixed').map((rate) => decimalFraction(rate.value)));
  const listRates = rates.filter((rate) => (rate.kind === 'fee' || rate.kind === 'tax') && rate.mode === 'percentage' && rate.rateBase === 'list_price');
  const netRates = rates.filter((rate) => (rate.kind === 'fee' || rate.kind === 'tax') && rate.mode === 'percentage' && rate.rateBase === 'net_after_discount');
  const listRate = addAll(listRates.map((rate) => decimalFraction(rate.value)));
  const netRate = addAll(netRates.map((rate) => decimalFraction(rate.value)));
  const fixedCharges = addAll(sumRates(rates, 'fee', 'fixed').map((rate) => decimalFraction(rate.value))
    .concat(sumRates(rates, 'tax', 'fixed').map((rate) => decimalFraction(rate.value))));
  const retainedRevenueRate = sub(sub(one, target), netRate);
  const coefficient = sub(mul(retainedRevenueRate, sub(one, percentDiscount)), listRate);
  if (compare(coefficient, zero()) <= 0) throw new PricingCalculationError('NON_POSITIVE_DENOMINATOR');
  const constant = add(add(ingredientsAndOther, fixedCharges), mul(retainedRevenueRate, fixedDiscount));
  return ensureRange(div(constant, coefficient));
};

const minimumForCmv = (target: Fraction, ingredients: Fraction, rates: PricingCalculationInput['rates']): Fraction => {
  const percentDiscount = addAll(sumRates(rates, 'discount', 'percentage').map((rate) => decimalFraction(rate.value)));
  const fixedDiscount = addAll(sumRates(rates, 'discount', 'fixed').map((rate) => decimalFraction(rate.value)));
  const retainedRate = sub(one, percentDiscount);
  if (compare(retainedRate, zero()) <= 0) throw new PricingCalculationError('NON_POSITIVE_DENOMINATOR');
  return ensureRange(div(add(div(ingredients, target), fixedDiscount), retainedRate));
};

const minimumCentWithPositiveRevenue = (rates: PricingCalculationInput['rates']): Fraction => {
  const percentDiscount = addAll(sumRates(rates, 'discount', 'percentage').map((rate) => decimalFraction(rate.value)));
  const fixedDiscount = addAll(sumRates(rates, 'discount', 'fixed').map((rate) => decimalFraction(rate.value)));
  const retainedRate = sub(one, percentDiscount);
  if (compare(retainedRate, zero()) <= 0) throw new PricingCalculationError('NON_POSITIVE_DENOMINATOR');
  const breakEven = div(fixedDiscount, retainedRate);
  const centsBelowOrAtBreakEven = (breakEven.n * 100n) / breakEven.d;
  return fraction(centsBelowOrAtBreakEven + 1n, 100n);
};

const roundedMetrics = (price: Fraction, ingredients: Fraction, totalCost: Fraction, rates: PricingCalculationInput['rates']) => {
  const result = metrics(price, ingredients, totalCost, rates);
  if (!result) return null;
  return {
    netRevenue: moneyOutput(result.netRevenue),
    contributionMargin: decimalOutput(result.contributionMargin),
    cmv: decimalOutput(result.cmv),
  };
};

export const calculatePricingQuote = (rawInput: PricingCalculationInput): PricingQuote => {
  const input = PricingCalculationInputSchema.parse(rawInput);
  const ingredients = ensureRange(ratioValue(input.ingredientCostExact));
  const packaging = ensureRange(ratioValue(input.packagingCostExact));
  const otherVariable = input.otherVariableCostExact
    ? ensureRange(ratioValue(input.otherVariableCostExact))
    : decimalFraction(input.otherVariableCost);
  const totalCost = add(add(ingredients, packaging), otherVariable);
  const rates = input.rates;

  const currentPrice = decimalFraction(input.listPrice);
  const currentMetricsRaw = metrics(currentPrice, ingredients, totalCost, rates);
  const candidates: Fraction[] = [];
  if (input.targetContributionMargin !== null) {
    if (compare(decimalFraction(input.targetContributionMargin), one) > 0) throw new PricingCalculationError('INVALID_TARGET');
    candidates.push(minimumForMargin(decimalFraction(input.targetContributionMargin), totalCost, rates));
  }
  if (input.targetCmv !== null) {
    const target = decimalFraction(input.targetCmv);
    if (compare(target, zero()) <= 0 || compare(target, one) > 0) throw new PricingCalculationError('INVALID_TARGET');
    candidates.push(minimumForCmv(target, ingredients, rates));
  }
  if (!candidates.length) throw new PricingCalculationError('INVALID_TARGET');
  const suggestedPrice = max(
    priceCeilToCent(maxFraction(candidates)),
    minimumCentWithPositiveRevenue(rates),
  );
  const rateBreakdown = rates.map((rate) => {
    if (rate.mode === 'fixed') return { rateId: rate.id, base: null, amount: rate.value };
    const percentage = decimalFraction(rate.value);
    const base = rate.kind === 'discount' || rate.rateBase === 'list_price'
      ? currentPrice
      : (currentMetricsRaw?.netRevenue ?? zero());
    return { rateId: rate.id, base: moneyOutput(base), amount: moneyOutput(mul(base, percentage)) };
  });
  const quote = {
    status: 'available' as const,
    reason: null,
    suggestedPrice: moneyOutput(suggestedPrice),
    costBuckets: {
      ingredients: moneyOutput(ingredients),
      packaging: moneyOutput(packaging),
      otherVariable: moneyOutput(otherVariable),
    },
    totalVariableCost: moneyOutput(totalCost),
    currentPriceMetrics: roundedMetrics(currentPrice, ingredients, totalCost, rates),
    suggestedPriceMetrics: roundedMetrics(suggestedPrice, ingredients, totalCost, rates),
    rateBreakdown,
  };
  return PricingQuoteSchema.parse(quote);
};

export const calculateComboCost = (rawInput: PricingComboCostInput) => {
  const input = PricingComboCostInputSchema.parse(rawInput);
  let ingredients = zero();
  let packaging = zero();
  let otherVariable = zero();
  for (const component of input.components) {
    const quantity = decimalFraction(component.quantity);
    otherVariable = add(otherVariable, mul(decimalFraction(component.otherVariableCostPerSale), quantity));
    const replaced = new Set(component.replacedPackagingPaths.map((path) => JSON.stringify(path)));
    const seen = new Set<string>();
    for (const item of component.costComponents) {
      const key = JSON.stringify(item.componentPath);
      if (seen.has(key)) throw new PricingCalculationError('MISSING_COST_COMPONENT');
      seen.add(key);
      if (item.role === 'ingredient') {
        if (replaced.has(key)) throw new PricingCalculationError('MISSING_COST_COMPONENT');
        ingredients = add(ingredients, mul(ratioValue(item.costPerFinalUnitExact), quantity));
      } else if (!replaced.has(key)) {
        packaging = add(packaging, mul(ratioValue(item.costPerFinalUnitExact), quantity));
      }
    }
    for (const path of replaced) {
      if (!seen.has(path)) throw new PricingCalculationError('MISSING_COST_COMPONENT');
    }
  }
  packaging = add(packaging, addAll(input.exclusivePackaging.map((item) => decimalFraction(item.costPerSale))));
  ingredients = ensureRange(ingredients);
  packaging = ensureRange(packaging);
  otherVariable = ensureRange(otherVariable);
  const total = ensureRange(add(add(ingredients, packaging), otherVariable));
  return {
    ingredientCostExact: exactMoneyOutput(ingredients),
    packagingCostExact: exactMoneyOutput(packaging),
    otherVariableCostExact: exactMoneyOutput(otherVariable),
    totalCostExact: exactMoneyOutput(total),
  };
};
