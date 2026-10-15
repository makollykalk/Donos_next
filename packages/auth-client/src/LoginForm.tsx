import {useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
export function LoginForm({auth,onLogin}:{auth:SupabaseClient;onLogin:()=>void}){
  const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[error,setError]=useState('');const[busy,setBusy]=useState(false);
  return <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{const result=await auth.auth.signInWithPassword({email,password});if(result.error)throw result.error;setPassword('');onLogin();}catch{setError('Não foi possível entrar. Confira email e senha ou tente novamente.');}finally{setBusy(false);}}}>
    <h1>Entrar como proprietário</h1><label>Email<input autoComplete="username" type="email" required value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Senha<input autoComplete="current-password" type="password" required value={password} onChange={event=>setPassword(event.target.value)}/></label><button disabled={busy}>Entrar</button>{error&&<p role="alert">{error}</p>}
  </form>;
}
