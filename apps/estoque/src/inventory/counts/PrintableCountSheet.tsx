import './printable-count-sheet.css';

export type PrintableCountSheetHeader = {
  restaurantName: string;
  locationName: string;
  cutAt: string;
  blind: boolean;
};

export type PrintableCountSheetRow = {
  ingredientName: string;
  unit: string;
  observation: string;
  countQuantity: string;
};

export type PrintableCountSheetProps = {
  header: PrintableCountSheetHeader;
  rows: PrintableCountSheetRow[];
};

export function PrintableCountSheet({ header, rows }: PrintableCountSheetProps) {
  return (
    <section className="count-sheet-print-area" aria-label="Folha de contagem física">
      <div className="count-sheet-toolbar">
        <button type="button" onClick={() => window.print()} aria-label="Imprimir folha de contagem">
          Imprimir / salvar em PDF
        </button>
      </div>

      <header className="count-sheet-header">
        <p className="count-sheet-eyebrow">DONOS Next · Estoque</p>
        <h1>Contagem física</h1>
        <dl className="count-sheet-metadata">
          <div>
            <dt>Unidade</dt>
            <dd>{header.restaurantName}</dd>
          </div>
          <div>
            <dt>Local</dt>
            <dd>{header.locationName}</dd>
          </div>
          <div>
            <dt>Data e hora do corte</dt>
            <dd><time dateTime={header.cutAt}>{header.cutAt}</time></dd>
          </div>
          <div>
            <dt>Modo</dt>
            <dd>{header.blind ? 'Contagem cega' : 'Contagem'}</dd>
          </div>
        </dl>
      </header>

      <table className="count-sheet-table">
        <caption>Insumos incluídos nesta contagem</caption>
        <thead>
          <tr>
            <th scope="col">Insumo</th>
            <th scope="col">Unidade</th>
            <th scope="col">Quantidade contada</th>
            <th scope="col">Observação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.ingredientName}-${index}`}>
              <th scope="row">{row.ingredientName}</th>
              <td>{row.unit}</td>
              <td className="count-sheet-quantity">{row.countQuantity || '\u00a0'}</td>
              <td>{row.observation || '\u00a0'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="count-sheet-footer">
        <p>Responsável pela contagem: ____________________________________</p>
        <p>Assinatura: ____________________________________ &nbsp; Data: ____ / ____ / ______</p>
      </footer>
    </section>
  );
}
