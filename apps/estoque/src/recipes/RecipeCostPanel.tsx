import type {RecipeCostDTO} from '@donos/contracts';
import {displayDecimal} from '../inventory/decimal-input.js';

export function RecipeCostPanel({cost,loading,error}:{cost:RecipeCostDTO|null;loading:boolean;error:string}){
 if(loading)return <section aria-label="Custo atual"><h4>Custo atual</h4><p role="status">Calculando o custo com os saldos atuais…</p></section>;
 if(error)return <section aria-label="Custo atual"><h4>Custo atual</h4><p role="alert">{error}</p></section>;
 if(!cost)return null;
 if(cost.status==='unavailable'){
  const reason=cost.reason==='NO_CURRENT_AVERAGE'?'Há insumo sem custo médio atual ou sem saldo. O custo completo não está disponível.':cost.reason==='CURRENT_VERSION_NOT_VALIDATED'?'A versão atual ainda não tem medição real validada. O custo de uma versão anterior não é apresentado como atual.':'Registre e valide uma medição real para calcular o custo por rendimento.';
  return <section aria-label="Custo atual"><h4>Custo atual</h4><p role="status">{reason}</p><p>Fonte prevista: custo médio móvel do estoque da unidade.</p></section>;
 }
 return <section aria-label="Custo atual"><h4>Custo atual da ficha</h4>
  <p>Custo do lote: R$ {displayDecimal(cost.batchCost??'0')}</p>
  <p>Rendimento final medido: {displayDecimal(cost.finalYield?.quantity??'0')} {cost.finalYield?.unit??''}</p>
  <p>Custo por unidade final: R$ {displayDecimal(cost.costPerFinalUnit??'0')} / {cost.finalYield?.unit??''}</p>
  <p>Fonte: custo médio móvel vigente na unidade. Calculado em {new Date(cost.calculatedAt).toLocaleString('pt-BR')}.</p>
  <p>Composição e medição atuais da ficha. O custo é recalculado quando o saldo muda.</p>
 </section>;
}
