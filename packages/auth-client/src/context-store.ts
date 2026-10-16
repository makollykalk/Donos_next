import type {ContextSelection,SelectedContext} from '@donos/contracts';
export class StaleContextError extends Error {constructor(){super('A unidade foi alterada. Selecione novamente.');}}
export class ContextStore {
  private selection:SelectedContext|null=null;
  private generation=0;
  constructor(private readonly selectRemote:(input:ContextSelection)=>Promise<SelectedContext>){}
  snapshot(){return {selection:this.selection,generation:this.generation};}
  clear(){this.selection=null;this.generation++;}
  async select(input:ContextSelection){
    this.clear(); const generation=this.generation;
    const selection=await this.selectRemote(input);
    this.assertCurrent(generation); this.selection=selection; return selection;
  }
  assertCurrent(generation:number){if(generation!==this.generation)throw new StaleContextError();}
  async read<T>(operation:(selection:SelectedContext)=>Promise<T>):Promise<T>{
    const {selection,generation}=this.snapshot(); if(!selection)throw new StaleContextError();
    const result=await operation(selection); this.assertCurrent(generation);return result;
  }
  async submit<T>(generation:number,operation:()=>Promise<T>):Promise<T>{this.assertCurrent(generation);return operation();}
}
