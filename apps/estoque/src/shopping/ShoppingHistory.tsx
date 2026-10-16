import type { ShoppingList } from '@donos/contracts';
type Props = { lists: ShoppingList[]; selectedId: string; onSelect: (id: string) => void; premium: boolean };
export function ShoppingHistory({ lists, selectedId, onSelect, premium }: Props) {
  return <section aria-label="Histórico de listas de compras"><h3>Histórico de listas</h3>{!premium && <p>O Premium não está disponível. O histórico continua visível; geração, edição e exportação estão desabilitadas.</p>}
    {!lists.length ? <p>Sem listas salvas nesta unidade.</p> : <ul>{lists.map(list => <li key={list.id}><button type="button" aria-current={selectedId === list.id ? 'true' : undefined} onClick={() => onSelect(list.id)}>{new Date(list.generatedAt).toLocaleString('pt-BR')} — {list.status}</button>{!premium && <button type="button" disabled>Exportar</button>}</li>)}</ul>}
  </section>;
}
