/** One list/query owns its page responses; older filters cannot overwrite it. */
export class ReadGeneration {
 private generation=0;private paging=false;
 reset(){this.generation++;this.paging=false;return this.generation;}
 current(value:number){return this.generation===value;}
 page(){if(this.paging)return null;this.paging=true;return this.generation;}
 finish(value:number){if(this.current(value))this.paging=false;}
}
