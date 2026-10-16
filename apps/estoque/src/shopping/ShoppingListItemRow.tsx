import { useState } from 'react';
import type { ShoppingListItem, ShoppingCommitment, Supplier } from '@donos/contracts';
import type { ShoppingClient } from './shopping-client.js';
import type { InventoryClient } from '../inventory/inventory-client.js';

type Props = { client: ShoppingClient; inventory: InventoryClient; item: ShoppingListItem; listId: string; editable: boolean; suppliers: Supplier[]; onChanged: () => void };
export function ShoppingListItemRow({ client, inventory, item, listId, editable, suppliers, onChanged }: Props) {
  const [quantity, setQuantity] = useState(item.purchaseQuantity);
  const [supplier, setSupplier] = useState(item.supplierId ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [commitment, setCommitment] = useState<ShoppingCommitment | null>(null);
  const [receiptQuantity, setReceiptQuantity] = useState('');
  const [receiptPrice, setReceiptPrice] = useState('');
  const [receiptSupplier, setReceiptSupplier] = useState('');
  const [receiptCreated, setReceiptCreated] = useState(false);
  const [error, setError] = useState('');
  const need = item.needSnapshot;
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true); setError('');
    try { await client.write(`/lists/${listId}/items/${item.id}`, patch, crypto.randomUUID(), 'PATCH'); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao editar o item.'); }
    finally { setBusy(false); }
  };
  async function confirmPurchase() {
    setBusy(true); setError('');
    try {
      const commitment = await client.write<ShoppingCommitment>(`/lists/${listId}/items/${item.id}/commitment`, { purchaseQuantity: quantity, confirmed: true, supplierId: supplier || null }, crypto.randomUUID());
      setCommitment(commitment); setReceiptQuantity(commitment.confirmedQuantity); setReceiptSupplier(commitment.supplierId ?? ''); setConfirmed(true); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao confirmar compra.'); }
    finally { setBusy(false); }
  }
  async function createLinkedReceipt() {
    if (!commitment || !receiptSupplier) return;
    setBusy(true); setError('');
    try {
      await inventory.write('/receipts', { supplierId: receiptSupplier, locationId: commitment.locationId, items: [{ ingredientId: commitment.ingredientId, quantity: receiptQuantity, unit: commitment.unit, unitPrice: receiptPrice, commitmentId: commitment.id }] }, crypto.randomUUID());
      setReceiptCreated(true); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao criar recebimento vinculado.'); }
    finally { setBusy(false); }
  }
  return <article aria-label={`Item ${need.ingredientName}`}>
    <h4>{need.ingredientName}</h4><p>Necessário: {need.neededBaseQuantity} {need.baseUnit}; sugestão inicial: {need.suggestedPurchaseQuantity} {need.conversion.label ?? need.baseUnit}. Compromissos confirmados: {need.committedPendingQuantity} {need.baseUnit}.</p>
    <p>Fornecedor sugerido: {need.supplierSuggestion?.name ?? 'Sem fornecedor'}{need.supplierSuggestion ? ` — referência ${need.supplierSuggestion.normalizedPrice.numerator}/${need.supplierSuggestion.normalizedPrice.denominator}, recebido em ${new Date(need.supplierSuggestion.postedAt).toLocaleDateString('pt-BR')}` : ''}</p>
    <label>Quantidade da compra — {need.ingredientName}<input aria-label={`Quantidade da compra ${need.ingredientName}`} inputMode="decimal" value={quantity} disabled={!editable || busy || confirmed} onChange={e => setQuantity(e.target.value)} /></label>
    <label>Fornecedor de {need.ingredientName}<select aria-label={`Fornecedor de ${need.ingredientName}`} value={supplier} disabled={!editable || busy || confirmed} onChange={e => setSupplier(e.target.value)}><option value="">Sem fornecedor</option>{need.supplierSuggestion && <option value={need.supplierSuggestion.supplierId}>{need.supplierSuggestion.name}</option>}</select></label>
    {editable && <><button type="button" disabled={busy || confirmed || quantity === item.purchaseQuantity} onClick={() => void save({ purchaseQuantity: quantity })}>Salvar quantidade</button><button type="button" disabled={busy || confirmed || supplier === (item.supplierId ?? '')} onClick={() => void save({ supplierId: supplier || null })}>Salvar fornecedor</button><button type="button" disabled={busy || confirmed} onClick={() => void save({ removed: !item.removed })}>{item.removed ? 'Restaurar item' : 'Remover da lista'}</button><label><input type="checkbox" checked={confirmationChecked} disabled={busy || confirmed} onChange={e => setConfirmationChecked(e.target.checked)} />Confirmo que esta compra foi feita</label><button type="button" disabled={busy || confirmed || !confirmationChecked} onClick={() => void confirmPurchase()}>Confirmar compra</button></>}
    {commitment && <section aria-label={`Recebimento vinculado ${need.ingredientName}`}><h5>Receber compra confirmada</h5><p>Informe a quantidade comercial efetivamente conferida. Recebimento parcial reduz o compromisso somente ao confirmar o rascunho de recebimento.</p>
      <label>Fornecedor do recebimento<select aria-label={`Fornecedor do recebimento ${need.ingredientName}`} value={receiptSupplier} disabled={busy || receiptCreated} onChange={e => setReceiptSupplier(e.target.value)}><option value="">Selecione fornecedor</option>{suppliers.filter(s => !s.archived).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Quantidade recebida de {need.ingredientName}<input aria-label={`Quantidade recebida ${need.ingredientName}`} inputMode="decimal" value={receiptQuantity} disabled={busy || receiptCreated} onChange={e => setReceiptQuantity(e.target.value)} /></label>
      <label>Preço efetivo por unidade de compra (R$)<input aria-label={`Preço unitário recebido ${need.ingredientName}`} inputMode="decimal" value={receiptPrice} disabled={busy || receiptCreated} onChange={e => setReceiptPrice(e.target.value)} /></label>
      <button type="button" disabled={busy || receiptCreated || !receiptSupplier || !receiptQuantity || !receiptPrice} onClick={() => void createLinkedReceipt()}>Criar rascunho de recebimento vinculado</button>
      {receiptCreated && <p role="status">Rascunho criado. Abra o recebimento na seção Recebimentos e confirme a mercadoria para atualizar estoque e compromisso atomicamente.</p>}
    </section>}
    {confirmed && <p role="status">Compra confirmada. A quantidade passa a contar como compromisso pendente.</p>}{error && <p role="alert">{error}</p>}
  </article>;
}
