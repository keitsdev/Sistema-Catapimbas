import { useState } from 'react'
import { Abas, Aviso, Erro, Tag, useAcao, useCarregar } from '../components/ui'
import { useAuth } from '../auth'
import { decidirSolicitacaoPlataforma, listarUsuariosPlataforma, solicitacoesPlataforma, visaoPlataforma } from '../servicos/plataforma'
import { ConviteSuperadmin } from '../components/ConviteAvaliador'
import { PAPEL_LABEL, SITUACAO_LABEL, type Papel } from '../types'

export default function Plataforma() {
  const { ctx } = useAuth(); const [aba, setAba] = useState('geral')
  const visao = useCarregar(() => visaoPlataforma(ctx!), [ctx]); const pend = useCarregar(() => solicitacoesPlataforma(ctx!), [ctx])
  const usuarios = useCarregar(() => listarUsuariosPlataforma(ctx!), [ctx]); const a = useAcao()
  const [just, setJust] = useState<Record<number, string>>({}); const [papel, setPapel] = useState<Record<number, Papel>>({})
  const decidir = async (id: number, ok: boolean, atual: Papel) => { if (await a.executar(() => decidirSolicitacaoPlataforma(ctx!, id, ok, just[id], papel[id] ?? atual), ok ? 'Cadastro aprovado.' : 'Cadastro recusado.')) { pend.recarregar(); visao.recarregar(); usuarios.recarregar() } }
  const v = visao.dados
  return (<>
    <h1>Plataforma</h1>
    <Abas atual={aba} onChange={setAba} abas={[['geral', 'Visão geral'], ['cadastros', `Cadastros pendentes${pend.dados?.length ? ` (${pend.dados.length})` : ''}`], ['usuarios', 'Usuários'], ['convites', 'Convidar avaliador']]} />
    <Erro texto={visao.erro || pend.erro || usuarios.erro} /><Aviso msg={a.msg} />
    {aba === 'geral' && v && <>
      <div className="kpis">{([['Instituições', `${v.ativas} ativas de ${v.instituicoes}`], ['Usuários', v.usuarios], ['Projetos', v.projetos], ['Bancas', v.bancas], ['Cadastros pendentes', v.pendentes]] as [string, string | number][]).map(([l, x]) => <div className="kpi" key={l}><b>{x}</b><span>{l}</span></div>)}</div>
      <div className="tabela-wrap"><table><thead><tr><th>Instituição</th><th>Situação</th><th>Pessoas</th><th>Projetos</th></tr></thead>
        <tbody>{v.porInstituicao.map(i => <tr key={i.id}><td>{i.nome}</td><td><Tag valor={i.status === 'ativa' ? 'ativa' : 'suspensa'} rotulo={i.status === 'ativa' ? 'Ativa' : 'Suspensa'} /></td><td>{i.pessoas}</td><td>{i.projetos}</td></tr>)}</tbody></table></div>
      <p className="muted small">Contagens agregadas; o superadministrador não vê notas nem dados internos dos projetos de cada instituição.</p></>}
    {aba === 'cadastros' && (!pend.dados?.length ? <p className="vazio">Nenhum cadastro pendente em nenhuma instituição.</p> : pend.dados.map(s => (
      <div className="card pedido" key={s.id}>
        <div><b>{s.nome}</b><br /><span className="muted">{s.email} · {s.instituicao}</span></div>
        <div className="stack"><select aria-label={`Papel de ${s.nome}`} value={papel[s.id] ?? s.papel} onChange={e => setPapel({ ...papel, [s.id]: e.target.value as Papel })}>{(['admin', 'coordenador', 'orientador', 'avaliador', 'aluno'] as Papel[]).map(p => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}</select>
          <input placeholder="Justificativa (obrigatória para recusar)" aria-label={`Justificativa para ${s.nome}`} value={just[s.id] ?? ''} onChange={e => setJust({ ...just, [s.id]: e.target.value })} /></div>
        <div className="acoes"><button onClick={() => decidir(s.id, true, s.papel)}>Aprovar</button><button className="ghost" onClick={() => decidir(s.id, false, s.papel)}>Recusar</button></div>
      </div>)))}
    {aba === 'convites' && <ConviteSuperadmin />}
    {aba === 'usuarios' && <div className="tabela-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Vínculos</th></tr></thead>
      <tbody>{usuarios.dados?.map(u => <tr key={u.id}><td>{u.nome}</td><td>{u.email}</td><td>{u.vinculos.map((x, i) => <div key={i}>{x.instituicao} · {PAPEL_LABEL[x.papel]} · <Tag valor={x.situacao} rotulo={SITUACAO_LABEL[x.situacao]} /></div>)}</td></tr>)}</tbody></table></div>}
  </>)
}
