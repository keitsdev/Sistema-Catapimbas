import { useState, type FormEvent } from 'react'
import { Aviso, Campo, Tag, useAcao, useCarregar } from '../components/ui'
import { useAuth } from '../auth'
import { instituicoes } from '../api'
import { alterarSenha, exportarMeusDados, listarInstituicoesPublicas, solicitarExclusao, solicitarIngresso } from '../servicos/acesso'
import { PAPEL_LABEL, SITUACAO_LABEL, type Papel } from '../types'

export default function Perfil() {
  const { user, ctx } = useAuth(); const [r, setR] = useState(0)
  const insts = useCarregar(listarInstituicoesPublicas, []).dados ?? []
  const [s, setS] = useState({ atual: '', nova: '' }); const [ing, setIng] = useState({ instituicaoId: 0, papel: 'aluno' as Papel }); const [motivo, setMotivo] = useState('')
  const a1 = useAcao(), a2 = useAcao(), a3 = useAcao(), a4 = useAcao()
  const trocar = async (e: FormEvent) => { e.preventDefault(); if (await a1.executar(() => alterarSenha(ctx!, s.atual, s.nova), 'Senha alterada.')) setS({ atual: '', nova: '' }) }
  async function baixar() { await a3.executar(async () => { const d = await exportarMeusDados(ctx!); const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); Object.assign(document.createElement('a'), { href: url, download: 'meus-dados.json' }).click(); URL.revokeObjectURL(url) }, 'Arquivo gerado.') }
  const alvo = ing.instituicaoId || insts.find(i => !user!.vinculos.some(v => v.instituicaoId === i.id))?.id || 0
  return (<div className="stack">
    <h1>Meu perfil</h1>
    <section className="card"><h2>{user!.nome}</h2><p className="muted">{user!.email}</p>
      <div className="tabela-wrap"><table><thead><tr><th>Instituição</th><th>Papel</th><th>Situação</th></tr></thead>
        <tbody key={r}>{user!.vinculos.map((v, i) => <tr key={i}><td>{instituicoes.find(x => x.id === v.instituicaoId)?.nome ?? 'Plataforma'}</td><td>{PAPEL_LABEL[v.papel]}</td><td><Tag valor={v.situacao} rotulo={SITUACAO_LABEL[v.situacao]} />{v.justificativa && <span className="muted small"> {v.justificativa}</span>}</td></tr>)}</tbody></table></div></section>
    <form className="card" onSubmit={trocar}><h2>Alterar senha</h2><div className="form-grid">
      <Campo rotulo="Senha atual"><input type="password" required value={s.atual} onChange={e => setS({ ...s, atual: e.target.value })} autoComplete="current-password" /></Campo>
      <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres."><input type="password" required minLength={8} value={s.nova} onChange={e => setS({ ...s, nova: e.target.value })} autoComplete="new-password" /></Campo></div><Aviso msg={a1.msg} /><button disabled={a1.ocupado}>Alterar senha</button></form>
    {ctx!.papel !== 'superadmin' && <section className="card"><h2>Participar de outra instituição</h2><p className="muted small">Você pode ter papéis diferentes em instituições diferentes. O pedido fica pendente até a aprovação do administrador de lá.</p>
      <div className="form-grid"><Campo rotulo="Instituição"><select value={alvo} onChange={e => setIng({ ...ing, instituicaoId: +e.target.value })}>{insts.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></Campo>
        <Campo rotulo="Papel"><select value={ing.papel} onChange={e => setIng({ ...ing, papel: e.target.value as Papel })}>{(['aluno', 'orientador', 'avaliador'] as Papel[]).map(p => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}</select></Campo></div>
      <Aviso msg={a2.msg} /><button onClick={async () => { if (await a2.executar(() => solicitarIngresso(ctx!.usuarioId, alvo, ing.papel), 'Pedido enviado.')) setR(r + 1) }}>Solicitar ingresso</button></section>}
    <section className="card"><h2>Privacidade (LGPD)</h2><p className="muted small">Guardamos apenas nome, e-mail e vínculos, para identificar você e controlar o acesso. Você pode obter uma cópia dos seus dados ou pedir exclusão; o pedido é registrado e tratado pelo administrador.</p>
      <div className="acoes"><button className="ghost" onClick={baixar}>Baixar meus dados (JSON)</button></div><Aviso msg={a3.msg} />
      <Campo rotulo="Pedido de exclusão da conta"><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descreva o pedido" /></Campo><Aviso msg={a4.msg} />
      <button className="perigo" style={{ marginTop: '.6rem' }} onClick={() => a4.executar(() => solicitarExclusao(ctx!, motivo), 'Pedido registrado.')}>Solicitar exclusão</button></section>
  </div>)
}
