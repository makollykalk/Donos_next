import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createInventoryFixtures } from '../helpers/inventory-fixtures.js';
import { login } from './owner-fixture.js';

test('owner performs a blind count, re-counts, reviews and closes with confirmed value', async ({ page }) => {
  test.setTimeout(180000);
  const fixture = await createInventoryFixtures();
  try {
    const restaurants = await page.request.get(`http://127.0.0.1:3001/v1/organizations/${fixture.selection.organizationId}/restaurants`, { headers: { Authorization: `Bearer ${fixture.jwt}` } });
    expect(restaurants.status()).toBe(200);
    const restaurant = (await restaurants.json() as { items: Array<{ id: string; name: string }> }).items.find((item) => item.id === fixture.selection.restaurantId)!;
    const organizations = await page.request.get('http://127.0.0.1:3001/v1/organizations', { headers: { Authorization: `Bearer ${fixture.jwt}` } });
    const organization = (await organizations.json() as { items: Array<{ id: string; name: string }> }).items.find((item) => item.id === fixture.selection.organizationId)!;
    await login(page, 'a', 5174);
    await page.getByRole('button', { name: organization.name, exact: true }).click();
    await page.getByRole('button', { name: `Selecionar ${restaurant.name}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Estoque da unidade ativa', exact: true })).toBeVisible();

    const ingredient = `Auditoria UI ${randomUUID()}`;
    await page.getByLabel('Nome do insumo', { exact: true }).fill(ingredient);
    await page.getByRole('button', { name: 'Cadastrar insumo', exact: true }).click();
    const count = page.getByRole('region', { name: 'Contagem física do estoque' });
    await expect(count.getByRole('heading', { name: `Contagem física — Principal`, exact: true })).toBeVisible();
    await expect(count.getByLabel('Modo de contagem cega', { exact: true })).toBeChecked();
    await count.getByRole('button', { name: 'Iniciar contagem neste local', exact: true }).click();

    const quantity = count.getByLabel(`Quantidade física de ${ingredient}`, { exact: true });
    await expect(quantity).toBeVisible();
    await expect(count.getByText(/Saldo teórico:/)).toHaveCount(0);
    let printed = false;
    await page.evaluate(() => Object.defineProperty(window, 'print', { configurable: true, value: () => { document.documentElement.dataset.printCalled = 'true'; } }));
    await count.getByRole('button', { name: 'Imprimir folha de contagem', exact: true }).click();
    printed = await page.locator('html').getAttribute('data-print-called') === 'true';
    expect(printed).toBe(true);

    await quantity.fill('2');
    const totalValue = count.getByLabel(`Valor total de ${ingredient}`, { exact: true });
    await totalValue.fill('17,50');
    await count.getByRole('button', { name: 'Registrar contagem', exact: true }).click();
    await expect(count.getByRole('alert')).toBeVisible();
    await count.getByLabel('Confirmo o valor total informado', { exact: true }).check();
    await count.getByRole('button', { name: 'Registrar contagem', exact: true }).click();

    await count.getByLabel(`Motivo para recontar ${ingredient}`, { exact: true }).fill('Conferir segunda vez');
    await count.getByRole('button', { name: 'Solicitar recontagem', exact: true }).click();
    await quantity.fill('3');
    await totalValue.fill('20,00');
    await count.getByRole('button', { name: 'Registrar contagem', exact: true }).click();
    await count.getByRole('button', { name: 'Conferir divergências', exact: true }).click();
    await expect(count.getByRole('table')).toContainText('20');
    await expect(count.getByRole('table')).toContainText('3');
    await count.getByRole('button', { name: 'Voltar à contagem', exact: true }).click();
    await count.getByRole('button', { name: 'Validar item', exact: true }).click();
    await count.getByLabel('Revisei os itens validados e confirmo os ajustes de estoque', { exact: true }).check();
    await count.getByRole('button', { name: 'Fechar contagem e registrar ajustes', exact: true }).click();
    await expect(count.getByRole('heading', { name: 'Resumo de divergências', exact: true })).toBeVisible();
    await expect(count.getByRole('table')).toContainText('20');
    const row = page.getByRole('region', { name: 'Saldos de estoque' }).getByRole('row').filter({ hasText: ingredient });
    await expect(row).toContainText('3 kg');
    await expect(row).toContainText('20');
  } finally { await fixture.close(); }
});
