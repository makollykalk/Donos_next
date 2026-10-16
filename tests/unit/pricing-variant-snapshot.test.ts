import { expect, it } from 'vitest';
import type { PricingCostComponent } from '@donos/contracts';
import { scalePricingVariantCostComponents } from '@donos/domain-pricing';

const ratio = (numerator: string): { numerator: string; denominator: string } => ({ numerator, denominator: '1' });

it('scales recipe components by quantityPerSale but keeps App 02 packaging once per sale', () => {
  const recipeComponents: PricingCostComponent[] = [
    { componentPath: ['recipe', 'ingredient'], role: 'ingredient', costPerFinalUnitExact: ratio('1250000000000') },
    { componentPath: ['recipe', 'package'], role: 'packaging', costPerFinalUnitExact: ratio('250000000000') },
  ];
  const app02Packaging: PricingCostComponent[] = [
    { componentPath: ['app02-packaging', 'box'], role: 'packaging', costPerFinalUnitExact: ratio('700000000000') },
  ];

  expect(scalePricingVariantCostComponents(recipeComponents, app02Packaging, '3')).toEqual([
    { ...recipeComponents[0]!, costPerFinalUnitExact: ratio('3750000000000') },
    { ...recipeComponents[1]!, costPerFinalUnitExact: ratio('750000000000') },
    app02Packaging[0],
  ]);
});
