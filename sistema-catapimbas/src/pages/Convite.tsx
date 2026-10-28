import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Aviso, Campo, Erro, useAcao, useCarregar } from '../components/ui'
import { useAuth } from '../auth'
import { aceitarConvite, consultarConvite } from '../servicos/convites'

export const ConviteRota = () => <Convite token={useParams().token ?? ''} />

export default function Convite({ token }: { token: string }) {
  const { user, sair, entrar } = useAuth(); const nav = useNavigate()
  const info = useCarregar(() => consultarConvite(token), [token]); const a = useAcao()
  const [f, setF] = useState({ nome: '', email: '', organizacao: '' }); const [pronto, setPronto] = useState<{ email: string; senha: string }>(); const [copiado, setCopiado] = useState(false)
  async function enviar(e: FormEvent) { e.preventDefault(); await a.executar(async () => { const r = await aceitarConvite(token, f); setPronto({ email: r.email, senha: r.senhaTemporaria }) }, '') }
  async function entrarAgora() { await a.executar(async () => { await entrar(pronto!.email, pronto!.senha); nav('/avaliar') }, '') }
  const hero = <section className="login-hero"><h1>Você foi convidado(a) para avaliar.</h1><p>Cadastro rápido, sem aprovação. Você poderá avaliar <b>somente o projeto</b> deste convite.</p></section>
  if (user) return <div className="card detalhe"><h2>Você já está conectado</h2><p>Para usar este convite, saia da conta de <b>{user.nome}</b> e abra o link novamente.</p><button onClick={sair}>Sair e continuar</button></div>
  return (
    <div className="login">{hero}
      {pronto ? (
        <div className="card login-form largo"><h2>Cadastro concluído ✔</h2>
          <p>Sua senha temporária (anote — ela não será mostrada de novo):</p>
          <p className="senha-temp" aria-label="Senha temporária">{pronto.senha}</p>
          <div className="acoes"><button type="button" className="ghost" onClick={async () => { try { await navigator.clipboard.writeText(pronto.senha) } catch { /* sem permissão de área de transferência */ } setCopiado(true) }}>{copiado ? 'Copiada ✔' : 'Copiar senha'}</button></div>
          <p className="small muted">Para entrar depois, use o e-mail <b>{pronto.email}</b> e esta senha. Você pode trocá-la em “Meu perfil”.</p>
          <Aviso msg={a.msg} /><button disabled={a.ocupado} onClick={entrarAgora}>Entrar e começar a avaliar</button></div>
      ) : info.erro ? (
        <div className="card login-form largo"><h2>Convite indisponível</h2><Erro texto={info.erro} /><button onClick={() => nav('/')}>Ir para o login</button></div>
      ) : !info.dados ? <div className="card login-form largo"><p>Verificando convite…</p></div> : (
        <form className="card login-form largo" onSubmit={enviar}>
          <h2>Cadastro de avaliador</h2>
          <p className="aviso-topo">Projeto: <b>{info.dados.projeto}</b><br /><span className="small">{info.dados.banca} · {info.dados.instituicao}</span></p>
          <Campo rotulo="Seu nome *"><input required minLength={3} autoFocus autoComplete="name" value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
          <Campo rotulo="Seu e-mail *"><input type="email" required autoComplete="email" inputMode="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Campo>
          <Campo rotulo="Sua instituição (opcional)"><input autoComplete="organization" value={f.organizacao} onChange={e => setF({ ...f, organizacao: e.target.value })} placeholder="Onde você trabalha ou estuda" /></Campo>
          <Aviso msg={a.msg} /><button disabled={a.ocupado}>{a.ocupado ? 'Cadastrando…' : 'Quero avaliar este projeto'}</button>
          <p className="small muted">Usamos seu nome e e-mail apenas para identificar suas avaliações (LGPD).</p>
        </form>)}
    </div>
  )
}
