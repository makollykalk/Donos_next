import {createRoot} from 'react-dom/client';
import {createAuthClient,createOwnerRuntime} from '@donos/auth-client';
import {App} from './App.js';
const root=createRoot(document.getElementById('root')!);
try{
 const auth=createAuthClient({url:import.meta.env.VITE_SUPABASE_URL??'',publishableKey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??'',app:'portal',storage:sessionStorage});
 const runtime=createOwnerRuntime(auth,import.meta.env.VITE_API_URL??'http://127.0.0.1:3001');
 root.render(<App runtime={runtime}/>);
}catch{root.render(<main><h1>Configuração indisponível</h1><p>Configure a URL Auth e a chave pública deste ambiente DEV.</p></main>);}
