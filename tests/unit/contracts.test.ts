import { describe, expect, it } from 'vitest';
import {
  CapabilitySchema, ContextSelectionSchema, CreateOrganizationSchema,
  CreateRestaurantSchema, DecimalStringSchema, FeatureKeySchema,
  IntegerStringSchema, OrganizationSchema, RestaurantSchema, SelectedContextSchema,
} from '@donos/contracts';

const A = '10000000-0000-4000-8000-000000000001';
const A1 = '10000000-0000-4000-8000-000000000002';

describe('criação de empresa e unidade', () => {
  it('normaliza nomes sem aceitar proprietário/plano definidos pelo cliente', () => {
    expect(CreateOrganizationSchema.parse({ name: ' Loja ', firstRestaurant: { name: ' Matriz ' } }))
      .toEqual({ name: 'Loja', firstRestaurant: { name: 'Matriz' } });
    for (const extra of [{ owner_user_id: A }, { organization_id: A }, { role: 'admin' }, { plan: 'premium' }]) {
      expect(CreateOrganizationSchema.safeParse({ name: 'Loja', firstRestaurant: { name: 'Matriz' }, ...extra }).success).toBe(false);
    }
  });
  it.each(['', ' ', 'a'.repeat(121)])('rejeita nome inválido %j', (name) => {
    expect(CreateOrganizationSchema.safeParse({ name, firstRestaurant: { name: 'Matriz' } }).success).toBe(false);
    expect(CreateRestaurantSchema.safeParse({ name }).success).toBe(false);
  });
  it('limita também o nome da primeira unidade e campos aninhados', () => {
    expect(CreateOrganizationSchema.safeParse({ name: 'Loja', firstRestaurant: { name: ' ', organizationId: A } }).success).toBe(false);
    expect(CreateOrganizationSchema.safeParse({ name: 'Loja', firstRestaurant: { name: 'Matriz', organizationId: A } }).success).toBe(false);
    expect(CreateRestaurantSchema.safeParse({ name: 'Filial', organizationId: A }).success).toBe(false);
    expect(CreateRestaurantSchema.parse({ name: 'a'.repeat(120) }).name).toHaveLength(120);
  });
});

describe('representações exatas no transporte', () => {
  it.each(['0', '1', '-1', '0.001', '-0.001', '22.333333333333', '999999999999999999.999999999999'])('preserva decimal canônico %s como string', (value) => {
    expect(DecimalStringSchema.parse(value)).toBe(value);
  });
  it.each(['NaN', 'Infinity', '-Infinity', '1e3', '1,25', '+1', '-0', '-0.0', '01', '1.0', '0.1234567890123', '1000000000000000000', '.1', '1.', ' 1', '1\n'])('rejeita decimal não canônico %j', (value) => {
    expect(DecimalStringSchema.safeParse(value).success).toBe(false);
  });
  it.each([1, 0.1, null, undefined])('rejeita valor JSON não string %j', (value) => {
    expect(DecimalStringSchema.safeParse(value).success).toBe(false);
  });
  it.each(['0', '1', '9223372036854775807'])('preserva contador exato %s', (value) => {
    expect(IntegerStringSchema.parse(value)).toBe(value);
  });
  it.each(['9223372036854775808', '-1', '01', '1.2', '1e3', '1\n', '9'.repeat(10000)])('rejeita contador inválido sem float', (value) => {
    expect(IntegerStringSchema.safeParse(value).success).toBe(false);
  });
});

describe('contextos e respostas v1', () => {
  it('aceita UUIDs e rejeita IDs/atributos forjados na seleção', () => {
    expect(ContextSelectionSchema.parse({ organizationId: A, restaurantId: A1 })).toEqual({ organizationId: A, restaurantId: A1 });
    expect(ContextSelectionSchema.safeParse({ organizationId: 'bad', restaurantId: A1 }).success).toBe(false);
    expect(ContextSelectionSchema.safeParse({ organizationId: A, restaurantId: A1, ownerUserId: A }).success).toBe(false);
  });
  it('não publica proprietário, tokens ou campos extras nos DTOs de catálogo', () => {
    expect(OrganizationSchema.safeParse({ id: A, name: 'Empresa', ownerUserId: A }).success).toBe(false);
    expect(RestaurantSchema.parse({ id: A1, organizationId: A, name: 'Matriz' })).toEqual({ id: A1, organizationId: A, name: 'Matriz' });
  });
  it('valida contexto emitido com token de 32 bytes e instante UTC', () => {
    const result = { organizationId: A, restaurantId: A1, token: 'ab'.repeat(32), expiresAt: '2026-10-14T15:00:00.000Z' };
    expect(SelectedContextSchema.parse(result)).toEqual(result);
    expect(SelectedContextSchema.safeParse({ ...result, token: 'short' }).success).toBe(false);
    expect(SelectedContextSchema.safeParse({ ...result, expiresAt: '2026-10-14' }).success).toBe(false);
  });
  it('mantém o catálogo das seis concessões V3 e motivos fechados', () => {
    for (const feature of ['inventory_core', 'shopping_premium', 'ai_text_whatsapp', 'ai_photo', 'ai_voice', 'pricing_core']) {
      expect(FeatureKeySchema.parse(feature)).toBe(feature);
    }
    expect(FeatureKeySchema.safeParse('admin').success).toBe(false);
    expect(CapabilitySchema.parse({ feature: 'pricing_core', allowed: false, reason: 'NOT_GRANTED' }).allowed).toBe(false);
    expect(CapabilitySchema.safeParse({ feature: 'pricing_core', allowed: true, reason: 'UNLIMITED' }).success).toBe(false);
  });
});
