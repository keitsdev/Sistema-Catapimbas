import { useState, type FormEvent } from 'react'
import { Aviso, Campo, useAcao } from '../components/ui'
import { redefinirSenha, solicitarRecuperacao } from '../servicos/acesso'

export default function Recuperar({ onVoltar }: { onVoltar(): void }) {
  const [email, setEmail] = useState(''); const [etapa, setEtapa] = useState<1 | 2 | 3>(1); const [demo, setDemo] = useState<string>()
  const [token, setToken] = useState(''); const [nova, setNova] = useState(''); const a = useAcao()
  async function pedir(e: FormEvent) { e.preventDefault(); if (await a.executar(async () => { const r = await solicitarRecuperacao(email); setDemo(r.tokenDemo) }, 'Se o e-mail existir, as instruções foram enviadas.')) setEtapa(2) }
  async function trocar(e: FormEvent) { e.preventDefault(); if (await a.executar(() => redefinirSenha(token, nova), '')) setEtapa(3) }
  return (
    <div className="login">
      <section className="login-hero"><h1>Recupere seu acesso.</h1><p>Enviamos um código ao seu e-mail para definir uma nova senha.</p></section>
      <div className="card login-form largo">
        {etapa === 1 && <form className="login-form" onSubmit={pedir}><h2>Esqueci minha senha</h2>
          <Campo rotulo="E-mail da conta"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></Campo><Aviso msg={a.msg} /><button disabled={a.ocupado}>Enviar instruções</button></form>}
        {etapa === 2 && <form className="login-form" onSubmit={trocar}><h2>Nova senha</h2><Aviso msg={a.msg?.ok ? a.msg : undefined} />
          {demo && <p className="aviso-topo small">Modo demonstração (sem e-mail real): seu código é <b>{demo}</b>.</p>}
          <Campo rotulo="Código recebido"><input required value={token} onChange={e => setToken(e.target.value)} /></Campo>
          <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres."><input type="password" required minLength={8} value={nova} onChange={e => setNova(e.target.value)} autoComplete="new-password" /></Campo>
          {!a.msg?.ok && <Aviso msg={a.msg} />}<button disabled={a.ocupado}>Redefinir senha</button></form>}
        {etapa === 3 && <><h2>Senha alterada</h2><p>Você já pode entrar com a nova senha.</p></>}
        <button type="button" className="link" onClick={onVoltar}>Voltar ao login</button>
      </div>
    </div>
  )
}
