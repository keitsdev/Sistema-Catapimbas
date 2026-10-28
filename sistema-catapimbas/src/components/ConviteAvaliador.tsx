import { useEffect, useState } from 'react'
import { Aviso, Campo, Tag, dataHora, useAcao, useCarregar } from './ui'
import { useAuth } from '../auth'
import { listarBancas } from '../api'
import { VALIDADES, criarConvite, listarConvites, opcoesConviteSuperadmin, revogarConvite } from '../servicos/convites'
import { criarUrlConvite } from '../servicos/link-convite'
import type { Projeto } from '../types'

export default function ConviteAvaliador({ bancaId, projetoId }: { bancaId: number; projetoId: number }) {
  const { ctx } = useAuth(); const a = useAcao(); const [validade, setValidade] = useState(24); const [maxUsos, setMaxUsos] = useState(1)
  const [link, setLink] = useState(''); const [copiado, setCopiado] = useState(false)
  const lista = useCarregar(() => listarConvites(ctx!, { bancaId, projetoId }), [ctx, bancaId, projetoId])
  useEffect(() => { setLink(''); setCopiado(false); a.limpar() }, [bancaId, projetoId])
  async function gerar() {
    await a.executar(async () => { const r = await criarConvite(ctx!, { bancaId, projetoId, validadeHoras: validade, maxUsos }); setLink(criarUrlConvite(location.origin, import.meta.env.BASE_URL, r.token)); setCopiado(false); lista.recarregar() }, 'Link gerado! Copie e envie agora: por segurança ele não é mostrado de novo.')
  }
  async function copiar() { try { await navigator.clipboard.writeText(link) } catch { (document.getElementById('link-convite') as HTMLInputElement | null)?.select(); document.execCommand('copy') } setCopiado(true) }
  return (
    <div className="stack">
      <div className="form-grid">
        <Campo rotulo="Validade do link"><select value={validade} onChange={e => setValidade(+e.target.value)}>{VALIDADES.map(([h, r]) => <option key={h} value={h}>{r}</option>)}</select></Campo>
        <Campo rotulo="Quantas pessoas podem usar"><select value={maxUsos} onChange={e => setMaxUsos(+e.target.value)}>{[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n === 1 ? '1 pessoa' : `${n} pessoas`}</option>)}</select></Campo>
      </div>
      <button type="button" onClick={gerar} disabled={a.ocupado}>{a.ocupado ? 'Gerando…' : 'Gerar link de convite'}</button>
      <Aviso msg={a.msg} />
      {link && <div className="card muted-card"><label htmlFor="link-convite"><b>Link do convite</b></label>
        <input id="link-convite" readOnly value={link} onFocus={e => e.currentTarget.select()} style={{ width: '100%' }} />
        <div className="acoes" style={{ marginTop: '.6rem' }}><button type="button" onClick={copiar}>{copiado ? 'Link copiado ✔' : 'Copiar link'}</button>
          <a className="botao-link" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Você foi convidado(a) para avaliar um projeto. Cadastre-se por este link: ${link}`)}`}>Enviar por WhatsApp</a></div>
        <p className="muted small">Quem abrir o link informa nome e e-mail e já pode avaliar <b>apenas este projeto</b>.</p></div>}
      <h3 className="small">Convites gerados para este projeto</h3>
      {!lista.dados?.length ? <p className="vazio">Nenhum convite gerado ainda.</p> : <div className="tabela-wrap"><table><thead><tr><th>Criado em</th><th>Situação</th><th>Usos</th><th>Expira em</th><th>Quem entrou</th><th /></tr></thead>
        <tbody>{lista.dados.map(c => <tr key={c.id}><td>{dataHora(c.criadoEm)}</td><td><Tag valor={c.situacao} rotulo={c.situacao[0].toUpperCase() + c.situacao.slice(1)} /></td><td>{c.usos}/{c.maxUsos}</td><td>{dataHora(c.expiraEm)}</td>
          <td>{c.usadoPor.map(u => u.nome).join(', ') || '—'}</td><td>{c.situacao === 'ativo' && <button type="button" className="perigo pequeno" onClick={async () => { if (await a.executar(() => revogarConvite(ctx!, c.id), 'Convite revogado.')) lista.recarregar() }}>Revogar</button>}</td></tr>)}</tbody></table></div>}
      <p className="muted small">Para tirar o acesso de quem já entrou, use <b>Pessoas → Bloquear/Revogar</b>.</p>
    </div>
  )
}

export function ConvitePorProjeto({ projeto, onFechar }: { projeto: Projeto; onFechar(): void }) {
  const { ctx } = useAuth(); const { dados } = useCarregar(async () => (await listarBancas(ctx!)).filter(b => b.projetoIds.includes(projeto.id) && (b.status === 'rascunho' || b.status === 'aberta')), [ctx, projeto.id])
  const [bid, setBid] = useState(0); const escolhida = bid || dados?.[0]?.id || 0
  return (
    <section className="card detalhe"><h2>Convidar avaliador para {projeto.nome}</h2>
      {!dados ? <p>Carregando…</p> : !dados.length ? <p className="vazio">Este projeto ainda não está em nenhuma banca aberta ou em rascunho. Inclua-o em uma banca (menu Bancas → Projetos e avaliadores) para poder convidar.</p> : <>
        {dados.length > 1 && <Campo rotulo="Banca"><select value={escolhida} onChange={e => setBid(+e.target.value)}>{dados.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></Campo>}
        {dados.length === 1 && <p className="muted">Banca: <b>{dados[0].nome}</b></p>}
        <ConviteAvaliador bancaId={escolhida} projetoId={projeto.id} /></>}
      <div className="acoes"><button className="ghost" onClick={onFechar}>Fechar</button></div></section>
  )
}

export function ConviteSuperadmin() {
  const { ctx } = useAuth(); const { dados = [] } = useCarregar(() => opcoesConviteSuperadmin(ctx!), [ctx])
  const [i, setI] = useState(0); const [b, setB] = useState(0); const [p, setP] = useState(0)
  const inst = dados.find(x => x.id === i) ?? dados[0]; const banca = inst?.bancas.find(x => x.id === b) ?? inst?.bancas[0]; const proj = banca?.projetos.find(x => x.id === p) ?? banca?.projetos[0]
  return (
    <div className="stack"><p className="muted">Escolha o projeto que a pessoa convidada poderá avaliar. Ela terá acesso somente a ele.</p>
      <div className="form-grid">
        <Campo rotulo="Instituição"><select value={inst?.id ?? 0} onChange={e => { setI(+e.target.value); setB(0); setP(0) }}>{dados.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
        <Campo rotulo="Banca"><select value={banca?.id ?? 0} onChange={e => { setB(+e.target.value); setP(0) }}>{inst?.bancas.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
        <Campo rotulo="Projeto"><select value={proj?.id ?? 0} onChange={e => setP(+e.target.value)}>{banca?.projetos.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo></div>
      {banca && proj ? <ConviteAvaliador bancaId={banca.id} projetoId={proj.id} /> : <p className="vazio">Não há banca em rascunho/aberta com projetos nesta instituição.</p>}
    </div>
  )
}
