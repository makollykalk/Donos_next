import { useEffect, useState } from 'react';
import type { InventoryCountSession, InventoryCountItem } from '@donos/contracts';
import type { InventoryClient } from '../inventory-client.js';
import { normalizeDecimalInput } from '../decimal-input.js';
import { PrintableCountSheet } from './PrintableCountSheet.js';

type Props = { client: InventoryClient; locationId: string; locationName: string; restaurantName: string; onChanged: () => void };
const message = (error: unknown) => error instanceof Error ? error.message : 'Falha na contagem física.';

export function InventoryCountWorkspace({ client, locationId, locationName, restaurantName, onChanged }: Props) {
  const [counts, setCounts] = useState<InventoryCountSession[]>([]);
  const [count, setCount] = useState<InventoryCountSession | null>(null);
  const [blind, setBlind] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmedValues, setConfirmedValues] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [closeConfirmed, setCloseConfirmed] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadCounts() {
    const result = await client.read<{ items: Array<{ id: string }> }>(`/counts?locationId=${encodeURIComponent(locationId)}`);
    const sessions = await Promise.all(result.items.map(({ id }) => client.read<InventoryCountSession>(`/counts/${id}`)));
    setCounts(sessions);
    setCount((current) => current && sessions.find((session) => session.id === current.id) || sessions.find((session) => session.status === 'open') || null);
  }

  useEffect(() => {
    let active = true;
    void loadCounts().catch((e: unknown) => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [client, locationId]);

  async function run<T>(path: string, body: unknown, method?: string): Promise<T> {
    setBusy(true); setError('');
    try {
      const result = await client.write<T>(path, body, crypto.randomUUID(), method);
      if (count) {
        const refreshed = await client.read<InventoryCountSession>(`/counts/${count.id}`);
        setCount(refreshed);
      }
      onChanged();
      return result;
    } catch (e) { setError(message(e)); throw e; }
    finally { setBusy(false); }
  }

  async function open() {
    setBusy(true); setError('');
    try {
      const session = await client.write<InventoryCountSession>('/counts', { locationId, blind }, crypto.randomUUID());
      setCount(session); setShowReview(false); setQuantities({}); setNotes({}); setValues({}); setConfirmedValues({});
      await loadCounts();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function reveal() {
    if (!count) return;
    setBusy(true); setError('');
    try {
      const report = await client.read<InventoryCountSession>(`/counts/${count.id}/report?phase=review`);
      setCount(report); setShowReview(true);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }

  async function recordItem(countId: string, item: InventoryCountItem) {
    let body: { quantity: string; observation?: string; positiveVarianceTotalValue?: string; positiveVarianceConfirmed?: true };
    try {
      const quantity = normalizeDecimalInput(quantities[item.id] ?? item.countedQuantity ?? '', 6);
      const totalValue = values[item.id];
      const hasTotalValue = totalValue !== undefined && totalValue.trim() !== '';
      body = {
        quantity,
        ...(notes[item.id] ? { observation: notes[item.id] } : {}),
        ...(hasTotalValue ? { positiveVarianceTotalValue: normalizeDecimalInput(totalValue, 12) } : {}),
        ...(hasTotalValue && confirmedValues[item.id] ? { positiveVarianceConfirmed: true as const } : {}),
      };
    } catch (e) { setError(message(e)); return; }
    try { await run<InventoryCountSession>(`/counts/${countId}/items/${item.id}/record`, body).then(setCount); } catch { /* run() displays API failures. */ }
  }

  const pending = count?.items.filter((item) => item.state === 'not_counted').length ?? 0;
  const canReveal = Boolean(count?.blind && pending === 0 && !showReview);
  const rows = (count?.items ?? []).map((item) => ({ ingredientName: item.ingredientName, unit: item.baseUnit, countQuantity: item.countedQuantity ?? '', observation: item.observations.at(-1)?.observation ?? '' }));

  return <section aria-label="Contagem física do estoque">
    <h3>Contagem física — {locationName}</h3>
    {!count && <>
      <p>Abra uma sessão para registrar o saldo de corte. Movimentos dos itens ficam bloqueados até fechar ou cancelar.</p>
      <label><input type="checkbox" checked={blind} disabled={busy} onChange={(event) => setBlind(event.target.checked)} />Modo de contagem cega</label>
      <button type="button" disabled={busy} onClick={() => void open()}>Iniciar contagem neste local</button>
      {counts.filter((session) => session.status !== 'open').slice(0, 5).map((session) => <button key={session.id} type="button" onClick={() => { setCount(session); setShowReview(session.status === 'closed'); }}>Abrir contagem {new Date(session.cutAt).toLocaleString('pt-BR')} — {session.status}</button>)}
    </>}
    {count && <>
      <p>Iniciada em <time dateTime={count.cutAt}>{new Date(count.cutAt).toLocaleString('pt-BR')}</time>. Itens pendentes: {pending} de {count.items.length}.</p>
      {count.status === 'open' && !showReview && <>
        <PrintableCountSheet header={{ restaurantName, locationName: count.locationName, cutAt: count.cutAt, blind: count.blind }} rows={rows} />
        <ol aria-label="Itens da contagem">
          {count.items.map((item: InventoryCountItem) => { const totalValue = values[item.id]; return <li key={item.id}>
            <h4>{item.ingredientName} ({item.baseUnit})</h4><p>Estado: {item.state === 'not_counted' ? 'Não contado' : item.state === 'review' ? 'Recontagem solicitada' : item.state === 'validated' ? 'Validado' : 'Contado'}</p>
            {item.theoreticalQuantity !== null && <p>Saldo teórico: {item.theoreticalQuantity} {item.baseUnit}</p>}
            <label>Quantidade física<input aria-label={`Quantidade física de ${item.ingredientName}`} inputMode="decimal" value={quantities[item.id] ?? item.countedQuantity ?? ''} disabled={busy || item.state === 'validated'} onChange={(event) => setQuantities({ ...quantities, [item.id]: event.target.value })} /></label>
            <label>Observação da contagem<input aria-label={`Observação de ${item.ingredientName}`} value={notes[item.id] ?? ''} disabled={busy || item.state === 'validated'} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} /></label>
            {(item.theoreticalQuantity === null || item.theoreticalQuantity === '0') && <><label>Valor total da divergência positiva (R$)<input aria-label={`Valor total de ${item.ingredientName}`} inputMode="decimal" value={totalValue ?? ''} disabled={busy || item.state === 'validated'} onChange={(event) => setValues({ ...values, [item.id]: event.target.value })} /></label><label><input type="checkbox" checked={confirmedValues[item.id] ?? false} disabled={busy || item.state === 'validated'} onChange={(event) => setConfirmedValues({ ...confirmedValues, [item.id]: event.target.checked })} />Confirmo o valor total informado</label></>}
            <button type="button" disabled={busy || item.state === 'validated' || !(quantities[item.id] ?? item.countedQuantity)} onClick={() => void recordItem(count.id, item)}>Registrar contagem</button>
            {item.state === 'counted' && <><label>Motivo para recontagem<input aria-label={`Motivo para recontar ${item.ingredientName}`} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" disabled={busy || !reason.trim()} onClick={() => void run<InventoryCountSession>(`/counts/${count.id}/items/${item.id}/review`, { reason }).then(setCount).catch(() => undefined)}>Solicitar recontagem</button><button type="button" disabled={busy} onClick={() => void run<InventoryCountSession>(`/counts/${count.id}/items/${item.id}/validate`, {}).then(setCount).catch(() => undefined)}>Validar item</button></>}
          </li>; })}
        </ol>
        {canReveal && <button type="button" disabled={busy} onClick={() => void reveal()}>Conferir divergências</button>}
        <label><input type="checkbox" checked={closeConfirmed} disabled={busy} onChange={(event) => setCloseConfirmed(event.target.checked)} />Revisei os itens validados e confirmo os ajustes de estoque</label>
        <button type="button" disabled={busy || !closeConfirmed || count.items.some((item) => item.state !== 'validated')} onClick={() => void run<InventoryCountSession>(`/counts/${count.id}/close`, { confirmed: true }).then((session) => { setCount(session); setShowReview(true); setCloseConfirmed(false); }).catch(() => undefined)}>Fechar contagem e registrar ajustes</button>
        <label>Motivo do cancelamento<input value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
        <button type="button" disabled={busy || !reason.trim()} onClick={() => void run<InventoryCountSession>(`/counts/${count.id}/cancel`, { reason }).then((session) => { setCount(session); setShowReview(false); }).catch(() => undefined)}>Cancelar contagem</button>
      </>}
      {(showReview || count.status === 'closed') && <>
        <h4>Resumo de divergências</h4><table><thead><tr><th>Insumo</th><th>Teórico</th><th>Contado</th><th>Diferença</th><th>Impacto (R$)</th></tr></thead><tbody>{count.items.map((item) => <tr key={item.id}><th>{item.ingredientName}</th><td>{item.theoreticalQuantity ?? '—'}</td><td>{item.countedQuantity ?? '—'}</td><td>{item.difference ?? '—'}</td><td>{item.impactValue ?? '—'}</td></tr>)}</tbody></table>
        {count.status === 'open' && <button type="button" onClick={() => setShowReview(false)}>Voltar à contagem</button>}
        {count.status !== 'open' && <button type="button" onClick={() => { setCount(null); setShowReview(false); }}>Voltar às contagens</button>}
      </>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
