import { useState, type FormEvent } from 'react'
import { Aviso, Campo, useAcao, useCarregar } from '../components/ui'
import { cadastrarUsuario, listarInstituicoesPublicas } from '../servicos/acesso'
import { PAPEL_LABEL, type Papel } from '../types'

export default function Cadastro({ onVoltar }: { onVoltar(): void }) {
  const { dados: insts } = useCarregar(listarInstituicoesPublicas, [])
  const [f, setF] = useState({ nome: '', email: '', senha: '', instituicaoId: 0, papel: 'aluno' as Papel })
  const [enviado, setEnviado] = useState(false); const [confirmarEmail, setConfirmarEmail] = useState(false); const a = useAcao()
  async function enviar(e: FormEvent) {
    e.preventDefault()
    const ok = await a.executar(async () => {
      const result = await cadastrarUsuario({ ...f, instituicaoId: f.instituicaoId || insts?.[0]?.id || 0 })
      setConfirmarEmail(Boolean(result?.emailConfirmationRequired))
    }, '')
    if (ok) setEnviado(true)
  }
  return (
    <div className="login">
      <section className="login-hero"><h1>Peça seu ingresso.</h1><p>Seu cadastro fica <b>pendente</b> até o administrador da instituição aprovar. Enquanto isso, nenhuma área protegida é liberada.</p></section>
      {enviado ? (
        <div className="card login-form largo"><h2>Solicitação enviada</h2><p>{confirmarEmail ? 'Confira sua caixa de entrada e confirme o e-mail. Depois, o administrador da instituição vai analisar seu pedido; o acesso só será liberado após a confirmação e aprovação.' : 'O administrador da instituição vai analisar seu pedido. Você poderá entrar assim que ele for aprovado; se for recusado, o motivo aparecerá no login.'}</p><button onClick={onVoltar}>Voltar ao login</button></div>
      ) : (
        <form className="card login-form largo" onSubmit={enviar}>
          <h2>Criar conta</h2>
          <Campo rotulo="Nome completo"><input required minLength={3} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} autoComplete="name" /></Campo>
          <Campo rotulo="E-mail"><input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} autoComplete="email" /></Campo>
          <Campo rotulo="Senha" dica="Mínimo de 8 caracteres."><input type="password" required minLength={8} value={f.senha} onChange={e => setF({ ...f, senha: e.target.value })} autoComplete="new-password" /></Campo>
          <Campo rotulo="Instituição"><select value={f.instituicaoId || insts?.[0]?.id || 0} onChange={e => setF({ ...f, instituicaoId: +e.target.value })}>{insts?.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></Campo>
          <Campo rotulo="Quero entrar como"><select value={f.papel} onChange={e => setF({ ...f, papel: e.target.value as Papel })}>{(['aluno', 'orientador', 'avaliador'] as Papel[]).map(p => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}</select></Campo>
          <Aviso msg={a.msg} />
          <button disabled={a.ocupado}>{a.ocupado ? 'Enviando…' : 'Solicitar ingresso'}</button>
          <p className="small muted">Seus dados são usados apenas para identificar você e controlar o acesso (LGPD). Você pode pedir acesso ou exclusão em “Meu perfil”.</p>
          <button type="button" className="link" onClick={onVoltar}>Já tenho conta</button>
        </form>)}
    </div>
  )
}
