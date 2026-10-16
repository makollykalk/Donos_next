import { expect, test } from '@playwright/test';
import { login } from './owner-fixture.js';

const org = '10000000-0000-4000-8000-000000000010';
const restaurant = '10000000-0000-4000-8000-000000000011';
const location = '30000000-0000-4000-8000-000000000011';
const ingredient = '40000000-0000-4000-8000-000000000011';
const listId = '50000000-0000-4000-8000-000000000011';
const itemId = '60000000-0000-4000-8000-000000000011';
const supplier = '70000000-0000-4000-8000-000000000011';
const need = {
  ingredientId: ingredient, ingredientName: 'Farinha teste', locationId: location, baseUnit: 'kg',
  balanceQuantity: '1', minimumQuantity: '2', targetQuantity: '5', committedPendingQuantity: '0',
  neededBaseQuantity: '4', suggestedBaseQuantity: '4', suggestedPurchaseQuantity: '4',
  conversion: { ingredientId: ingredient, baseUnit: 'kg', allowFractionalCount: true, inputUnit: { kind: 'standard', code: 'kg' }, factorToBase: '1', conversionId: null, version: null, label: null },
  critical: true, supplierSuggestion: { supplierId: supplier, name: 'Fornecedor teste', normalizedPrice: { numerator: '10', denominator: '1' }, postedAt: '2026-10-16T12:00:00.000Z', documentDate: '2026-10-15' },
};
const threshold = { id: '80000000-0000-4000-8000-000000000011', organizationId: org, restaurantId: restaurant, locationId: location, ingredientId: ingredient, baseUnit: 'kg', minimumQuantity: '2', targetQuantity: '5', updatedAt: '2026-10-16T12:00:00.000Z' };
const list = { id: listId, organizationId: org, restaurantId: restaurant, locationId: location, status: 'draft', createdAt: '2026-10-16T12:00:00.000Z', generatedAt: '2026-10-16T12:00:00.000Z', ledgerSequenceAtGeneration: '0', items: [{ id: itemId, listId, needSnapshot: need, purchaseQuantity: '4', supplierId: supplier, removed: false, note: null }] };

test('shopping Base alerts, Premium edits, explicit confirmation, and print/export are mocked', async ({ page }) => {
  let savedList = false;
  let commitmentCreated = false;
  let receiptLinked = false;
  let premiumRevoked = false;
  await page.route('http://127.0.0.1:3001/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/v1/me')) return route.fulfill({ json: {} });
    if (url.pathname.endsWith('/v1/organizations') && route.request().method() === 'GET') return route.fulfill({ json: { items: [{ id: org, name: 'DEV Empresa A' }] } });
    if (url.pathname.endsWith(`/organizations/${org}/restaurants`)) return route.fulfill({ json: { items: [{ id: restaurant, organizationId: org, name: 'DEV A1' }] } });
    if (url.pathname.endsWith(`/organizations/${org}/capabilities`)) return route.fulfill({ json: { items: [] } });
    if (url.pathname.endsWith('/v1/contexts')) return route.fulfill({ json: { organizationId: org, restaurantId: restaurant, token: 'a'.repeat(64), expiresAt: '2030-01-01T00:00:00.000Z' } });
    if (url.pathname.endsWith(`/restaurants/${restaurant}/access/estoque`)) return route.fulfill({ json: {} });
    if (url.pathname.includes('/inventory/')) {
    if (url.pathname.endsWith('/ingredients')) return route.fulfill({ json: { items: [{ id: ingredient, name: 'Farinha teste', baseUnit: 'kg', allowFractionalCount: true, archived: false }] } });
    if (url.pathname.endsWith('/suppliers')) return route.fulfill({ json: { items: [{ id: supplier, name: 'Fornecedor teste', archived: false }] } });
    if (url.pathname.endsWith('/receipts') && route.request().method() === 'POST') { const line = (route.request().postDataJSON() as { items?: Array<{ commitmentId?: string; quantity?: string }> }).items?.[0]; receiptLinked = Boolean(line?.commitmentId) && line?.quantity === '2'; return route.fulfill({ json: { id: 'a0000000-0000-4000-8000-000000000011' } }); }
    if (url.pathname.endsWith('/receipts')) return route.fulfill({ json: { items: [] } });
    if (url.pathname.endsWith('/locations')) return route.fulfill({ json: { items: [{ id: location, name: 'Cozinha', isDefault: true, archived: false }] } });
    if (url.pathname.endsWith('/balances')) return route.fulfill({ json: { items: [{ ingredientId: ingredient, locationId: location, quantity: '1', value: '10', averageCostRatio: { numerator: '10', denominator: '1' } }], totalValue: '10' } });
    return route.fulfill({ json: { items: [] } });
    }
    if (url.pathname.includes('/shopping/')) {
    const method = route.request().method();
    if (url.pathname.endsWith('/thresholds') && method === 'GET') return route.fulfill({ json: { items: [threshold] } });
    if (url.pathname.endsWith('/threshold') && method === 'PUT') return route.fulfill({ json: threshold });
    if (url.pathname.endsWith('/lists') && method === 'GET') return route.fulfill({ json: { items: savedList ? [list] : [], nextCursor: null } });
    if (url.pathname.endsWith('/lists') && method === 'POST') { if (premiumRevoked) return route.fulfill({ status: 403, json: { error: { code: 'ENTITLEMENT_REQUIRED' } } }); savedList = true; return route.fulfill({ json: list }); }
    if (url.pathname.endsWith(`/lists/${listId}`) && method === 'GET') return route.fulfill({ json: list });
    if (url.pathname.endsWith(`/lists/${listId}/items/${itemId}`) && method === 'PATCH') return route.fulfill({ json: list });
    if (url.pathname.endsWith(`/lists/${listId}/items/${itemId}/commitment`) && method === 'POST') { commitmentCreated = true; return route.fulfill({ json: { id: '90000000-0000-4000-8000-000000000011', organizationId: org, restaurantId: restaurant, locationId: location, ingredientId: ingredient, listId, listItemId: itemId, supplierId: supplier, baseUnit: 'kg', unit: { kind: 'standard', code: 'kg' }, conversion: need.conversion, confirmedQuantity: '4', committedBaseQuantity: '4', receivedBaseQuantity: '0', remainingBaseQuantity: '4', status: 'confirmed', confirmedAt: '2026-10-16T12:00:00.000Z', confirmedBy: 'b0000000-0000-4000-8000-000000000011' } }); }
    if (url.pathname.endsWith(`/lists/${listId}/export.csv`)) return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: 'Insumo;Quantidade\r\nFarinha teste;4' });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
    }
    if (url.pathname.includes('/recipes')) return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  await login(page, 'a', 5176);
  await page.getByRole('button', { name: 'DEV Empresa A', exact: true }).click();
  await page.getByRole('button', { name: 'Selecionar DEV A1' }).click();
  await expect(page.getByRole('heading', { name: 'Estoque da unidade ativa' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Alertas de estoque crítico' })).toContainText('Farinha teste');
  await page.getByRole('button', { name: 'Gerar lista de compras' }).click();
  await expect(page.getByRole('region', { name: 'Itens da lista de compras' })).toContainText('sugestão inicial: 4');
  await page.getByRole('checkbox', { name: 'Confirmo que esta compra foi feita' }).check();
  await page.getByRole('button', { name: 'Confirmar compra' }).click();
  await expect.poll(() => commitmentCreated).toBe(true);
  await expect(page.getByText('Compra confirmada.', { exact: false })).toBeVisible();
  await page.getByRole('textbox', { name: 'Quantidade recebida Farinha teste' }).fill('2');
  await page.getByRole('textbox', { name: 'Preço unitário recebido Farinha teste' }).fill('10');
  await page.getByRole('button', { name: 'Criar rascunho de recebimento vinculado' }).click();
  await expect.poll(() => receiptLinked).toBe(true);
  await expect(page.getByText('Rascunho criado.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  premiumRevoked = true;
  await page.getByRole('button', { name: 'Gerar lista de compras' }).click();
  await expect(page.getByText('O entitlement Premium está indisponível.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Histórico de listas de compras' })).toContainText('16/10/2026');
});
