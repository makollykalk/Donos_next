import { useEffect, useState } from 'react';
import type { Ingredient, ShoppingList, ShoppingListItem, StockThreshold, Supplier } from '@donos/contracts';
import type { InventoryClient } from '../inventory/inventory-client.js';
import type { ShoppingClient } from './shopping-client.js';
import { ShoppingListItemRow } from './ShoppingListItemRow.js';
import { ShoppingHistory } from './ShoppingHistory.js';

type Props = { client: ShoppingClient; inventory: InventoryClient; locationId: string; ingredients: Ingredient[]; thresholds: StockThreshold[]; suppliers: Supplier[] };
export function ShoppingListView({ client, inventory, locationId, ingredients, thresholds, suppliers }: Props) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selected, setSelected] = useState<ShoppingList | null>(null);
  const [premium, setPremium] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    let active = true;
    void client.read<{ items: ShoppingList[]; nextCursor: string | null }>(`/lists?locationId=${encodeURIComponent(locationId)}&limit=50`).then(result => { if (active) { setLists(result.items); setSelected(current => current ? result.items.find(item => item.id === current.id) ?? current : current); setPremium(true); } }).catch(e => { if (active) { setError(e instanceof Error ? e.message : 'Falha ao carregar histórico.'); if ((e as { status?: number }).status === 403) setPremium(false); } });
    return () => { active = false; };
  }, [client, locationId, revision]);
  async function open(id: string) {
    setError('');
    try { setSelected(await client.read<ShoppingList>(`/lists/${id}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao abrir lista.'); }
  }
  async function generate() {
    setBusy(true); setError('');
    try { setSelected(await client.write<ShoppingList>('/lists', { locationId }, crypto.randomUUID())); setPremium(true); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao gerar lista.'); if ((e as { status?: number }).status === 403) setPremium(false); }
    finally { setBusy(false); }
  }
  const exportCsv = async () => {
    if (!selected || !premium) return;
    try {
      const csv = await client.export(`/lists/${selected.id}/export.csv`);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `lista-compras-${selected.id}.csv`; anchor.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao exportar lista.'); if ((e as { status?: number }).status === 403) setPremium(false); }
  };
  const needsConfiguration = ingredients.filter(ingredient => !ingredient.archived && thresholds.some(t => t.ingredientId === ingredient.id));
  return <section aria-label="Lista inteligente de compras"><h3>Reposição inteligente — Premium</h3>
    <p>As quantidades sugeridas consideram somente compromissos de compra confirmados pelo dono. Rascunhos e recebimentos concluídos não reduzem a necessidade.</p>
    {!premium && <p role="status">O entitlement Premium está indisponível. Você ainda pode consultar o histórico, sem gerar, editar, confirmar ou exportar.</p>}
    {premium && <button type="button" disabled={busy || !needsConfiguration.length} onClick={() => void generate()}>Gerar lista de compras</button>}
    <ShoppingHistory lists={lists} selectedId={selected?.id ?? ''} onSelect={id => void open(id)} premium={premium} />
    {selected && <section aria-label="Itens da lista de compras"><h4>{new Date(selected.generatedAt).toLocaleString('pt-BR')} — lista {selected.status}</h4>
      <button type="button" disabled={!premium} onClick={() => window.print()}>Imprimir lista</button><button type="button" disabled={!premium} onClick={exportCsv}>Exportar CSV</button>
      {selected.items.filter(item => !item.removed).map((item: ShoppingListItem) => <ShoppingListItemRow key={item.id} client={client} inventory={inventory} item={item} listId={selected.id} editable={premium && selected.status === 'draft'} suppliers={suppliers} onChanged={refresh} />)}
    </section>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
