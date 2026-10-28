import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Abas, Aviso, Campo, Erro, Tag, useAcao, useCarregar } from '../components/ui'
import ConviteAvaliador from '../components/ConviteAvaliador'
import { AUDIO_ACCEPT, prepararArquivoAudio } from '../servicos/audio'
import { useAuth } from '../auth'
import { listarProjetos, publicarBanca } from '../api'
import { diretorio } from '../servicos/acesso'
import { APRESENTACAO_PADRAO, ESCALA, arquivarBanca, atualizarBanca, configurarApresentacao, contarAvaliacoes, definirCriterios, definirParticipantes, duplicarBanca, invalidarAvaliacao, mudarStatusBanca, obterBanca, progressoBanca, retirarPublicacao } from '../servicos/bancas'
import { BANCA_LABEL, type Banca, type Criterio } from '../types'

type Rec = () => void

export default function BancaDetalhe() {
  const { id } = useParams(); const bid = Number(id); const { ctx } = useAuth(); const [aba, setAba] = useState('dados')
  const { dados: b, erro, recarregar } = useCarregar(() => obterBanca(ctx!, bid), [ctx, bid])
  if (erro) return <><h1>Banca</h1><Erro texto={erro} /><Link to="/bancas">Voltar</Link></>
  if (!b) return <p>Carregando…</p>
  return (<>
    <div className="cab"><div><Link to="/bancas" className="small">← Bancas</Link><h1>{b.nome}</h1></div><div className="linha-acoes">{ctx!.papel === 'admin' && <button onClick={() => setAba('convites')}>Convidar avaliador</button>}<Tag valor={b.status} rotulo={BANCA_LABEL[b.status]} /></div></div>
    <Abas atual={aba} onChange={setAba} abas={[['dados', 'Dados e situação'], ['participantes', 'Projetos e avaliadores'], ['criterios', 'Critérios e rubricas'], ['podio', 'Pódio'], ['progresso', 'Acompanhamento'], ...(ctx!.papel === 'admin' ? [['convites', 'Convites'] as [string, string]] : [])]} />
    {aba === 'dados' && <Dados b={b} rec={recarregar} />}{aba === 'participantes' && <Participantes b={b} rec={recarregar} />}
    {aba === 'criterios' && <Criterios b={b} rec={recarregar} />}{aba === 'podio' && <Podio b={b} rec={recarregar} />}{aba === 'progresso' && <Progresso b={b} />}{aba === 'convites' && ctx!.papel === 'admin' && <Convites b={b} />}
  </>)
}

function Dados({ b, rec }: { b: Banca; rec: Rec }) {
  const { ctx } = useAuth(); const nav = useNavigate(); const a = useAcao(); const admin = ctx!.papel === 'admin'
  const [f, setF] = useState({ nome: b.nome, inicio: b.inicio ?? '', fim: b.fim ?? '', desempate: b.desempate ?? 'competicao', precisao: b.precisao ?? 2 }); const [motivo, setMotivo] = useState('')
  const trava = useCarregar(() => contarAvaliacoes(ctx!, b.id), [ctx, b.id, b.status]).dados ?? 0
  const salvar = async (e: FormEvent) => { e.preventDefault(); if (await a.executar(() => atualizarBanca(ctx!, b.id, f), 'Banca atualizada.')) rec() }
  const acao = (fn: () => Promise<unknown>, ok: string) => async () => { if (await a.executar(fn, ok)) rec() }
  return (<div className="stack">
    <form className="card" onSubmit={salvar}><h2>Dados</h2>
      <div className="form-grid">
        <div className="largo"><Campo rotulo="Nome"><input required minLength={3} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo></div>
        <Campo rotulo="Início"><input type="date" value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></Campo>
        <Campo rotulo="Término"><input type="date" value={f.fim} onChange={e => setF({ ...f, fim: e.target.value })} /></Campo>
        <Campo rotulo="Política de empate" dica={trava ? 'Travada: já existem avaliações.' : undefined}><select disabled={!!trava} value={f.desempate} onChange={e => setF({ ...f, desempate: e.target.value as 'competicao' | 'denso' })}><option value="competicao">Competição (1, 1, 3)</option><option value="denso">Densa (1, 1, 2)</option></select></Campo>
        <Campo rotulo="Casas decimais"><input type="number" min={0} max={4} disabled={!!trava} value={f.precisao} onChange={e => setF({ ...f, precisao: +e.target.value })} /></Campo></div>
      <button disabled={a.ocupado || b.status === 'publicada'}>Salvar dados</button></form>
    <section className="card"><h2>Ciclo da banca</h2>
      <p className="muted">Rascunho → Aberta (avaliadores lançam notas) → Encerrada → Publicada (resultados visíveis a todos os perfis autorizados).</p>
      <div className="acoes">
        {b.status === 'rascunho' && <button onClick={acao(() => mudarStatusBanca(ctx!, b.id, 'aberta'), 'Banca aberta para avaliação.')}>Abrir para avaliação</button>}
        {b.status === 'aberta' && <button onClick={acao(() => mudarStatusBanca(ctx!, b.id, 'encerrada'), 'Avaliações encerradas.')}>Encerrar avaliações</button>}
        {b.status === 'encerrada' && <><button className="ghost" onClick={acao(() => mudarStatusBanca(ctx!, b.id, 'aberta'), 'Banca reaberta.')}>Reabrir</button><button onClick={acao(() => publicarBanca(ctx!, b.id), 'Resultados publicados.')}>Publicar resultados</button></>}
        {b.status === 'publicada' && admin && <><input aria-label="Motivo" placeholder="Motivo para retirar a publicação" value={motivo} onChange={e => setMotivo(e.target.value)} /><button className="ghost" onClick={acao(() => retirarPublicacao(ctx!, b.id, motivo), 'Publicação retirada.')}>Retirar publicação</button></>}
      </div>
      <Aviso msg={a.msg} /></section>
    <section className="card"><h2>Reutilizar e arquivar</h2>
      <p className="muted">Duplicar copia critérios, rubricas e avaliadores para uma nova banca em rascunho, sem tocar no histórico desta.</p>
      <div className="acoes"><button className="ghost" onClick={async () => { let novo = 0; if (await a.executar(async () => { novo = (await duplicarBanca(ctx!, b.id)).id }, 'Banca duplicada.')) nav(`/bancas/${novo}`) }}>Duplicar banca</button>
        {admin && <button className="perigo" onClick={async () => { if (window.confirm('Arquivar esta banca? As avaliações são preservadas.') && await a.executar(() => arquivarBanca(ctx!, b.id), 'Banca arquivada.')) nav('/bancas') }}>Arquivar</button>}</div></section>
  </div>)
}

function Participantes({ b, rec }: { b: Banca; rec: Rec }) {
  const { ctx } = useAuth(); const a = useAcao()
  const projs = useCarregar(() => listarProjetos(ctx!), [ctx]).dados ?? []; const avs = useCarregar(() => diretorio(ctx!, 'avaliador'), [ctx]).dados ?? []
  const [ps, setPs] = useState<number[]>(b.projetoIds); const [as, setAs] = useState<number[]>(b.avaliadorIds)
  const alt = (l: number[], set: (v: number[]) => void, id: number) => set(l.includes(id) ? l.filter(x => x !== id) : [...l, id])
  return (<div className="card"><h2>Projetos participantes</h2>
    {!projs.length ? <p className="vazio">Cadastre projetos primeiro.</p> : <div className="lista-check">{projs.map(p => <label key={p.id}><input type="checkbox" checked={ps.includes(p.id)} onChange={() => alt(ps, setPs, p.id)} />{p.nome} <span className="muted small">{p.ano}/{p.semestre}</span></label>)}</div>}
    <h2 style={{ marginTop: '1rem' }}>Avaliadores designados</h2>
    {!avs.length ? <p className="vazio">Não há avaliadores aprovados nesta instituição.</p> : <div className="lista-check">{avs.map(p => <label key={p.id}><input type="checkbox" checked={as.includes(p.id)} onChange={() => alt(as, setAs, p.id)} />{p.nome}{p.convidadoPara && <span className="muted small"> (convidado)</span>}</label>)}</div>}
    <Aviso msg={a.msg} /><div className="acoes"><button disabled={a.ocupado} onClick={async () => { if (await a.executar(() => definirParticipantes(ctx!, b.id, ps, as), 'Participantes salvos.')) rec() }}>Salvar participantes</button></div></div>)
}

const MODELO = ['Clareza do Problema', 'Mercado e Escalabilidade', 'Conceito e Produto', 'Estratégia de Diferenciação', 'Desempenho da Apresentação']
type CritEd = { id?: number; titulo: string; descricao: string; peso: number; descritores: Record<number, string> }
const vazio = (titulo = ''): CritEd => ({ titulo, descricao: '', peso: 1, descritores: Object.fromEntries(ESCALA.map(n => [n, ''])) })

function Criterios({ b, rec }: { b: Banca; rec: Rec }) {
  const { ctx } = useAuth(); const a = useAcao(); const nav = useNavigate()
  const trava = (useCarregar(() => contarAvaliacoes(ctx!, b.id), [ctx, b.id]).dados ?? 0) > 0
  const [l, setL] = useState<CritEd[]>(b.criterios.map(c => ({ id: c.id, titulo: c.titulo, descricao: c.descricao ?? '', peso: c.peso, descritores: { ...c.descritores } })))
  const set = (i: number, p: Partial<CritEd>) => setL(l.map((c, k) => k === i ? { ...c, ...p } : c)); const soma = l.reduce((s, c) => s + (c.peso || 0), 0)
  return (<div className="stack">
    {trava && <p className="aviso-topo">Já existem avaliações nesta banca: critérios, pesos e descritores ficam congelados para preservar o histórico. Para mudar o instrumento, duplique a banca.</p>}
    {!l.length && <p className="vazio">Nenhum critério. Cada critério recebe nota inteira de 1 a 5 com descritor por faixa de nota.</p>}
    {l.map((c, i) => <fieldset className="criterio" key={c.id ?? `n${i}`} disabled={trava}><legend>Critério {i + 1}</legend>
      <div className="form-grid"><Campo rotulo="Título"><input value={c.titulo} onChange={e => set(i, { titulo: e.target.value })} /></Campo>
        <Campo rotulo="Peso" dica={soma > 0 ? `${((c.peso / soma) * 100).toFixed(0)}% do total` : undefined}><input type="number" min={0.1} step={0.1} value={c.peso} onChange={e => set(i, { peso: +e.target.value })} /></Campo>
        <div className="largo"><Campo rotulo="Aspecto avaliado"><input value={c.descricao} onChange={e => set(i, { descricao: e.target.value })} /></Campo></div></div>
      <div className="desc">{ESCALA.map(n => <Campo key={n} rotulo={`Nota ${n} – descritor`}><textarea value={c.descritores[n] ?? ''} onChange={e => set(i, { descritores: { ...c.descritores, [n]: e.target.value } })} /></Campo>)}</div>
      {!trava && <button type="button" className="ghost pequeno" style={{ marginTop: '.6rem' }} onClick={() => setL(l.filter((_, k) => k !== i))}>Remover critério</button>}</fieldset>)}
    <Aviso msg={a.msg} />
    <div className="acoes">{!trava && <><button type="button" className="ghost" onClick={() => setL([...l, vazio()])}>Adicionar critério</button>
      {!l.length && <button type="button" className="ghost" onClick={() => setL(MODELO.map(vazio))}>Começar com o instrumento de referência (5 critérios)</button>}
      <button disabled={a.ocupado} onClick={async () => { if (await a.executar(() => definirCriterios(ctx!, b.id, l.map(c => ({ ...c, peso: Number(c.peso) }))), 'Critérios salvos.')) rec() }}>Salvar critérios</button></>}
      {trava && <button onClick={async () => { let novo = 0; if (await a.executar(async () => { novo = (await duplicarBanca(ctx!, b.id)).id }, '')) nav(`/bancas/${novo}`) }}>Duplicar para nova versão</button>}
      <span className="muted small">Soma dos pesos: {soma}</span></div></div>)
}

function Podio({ b, rec }: { b: Banca; rec: Rec }) {
  const { ctx } = useAuth(); const a = useAcao(); const [f, setF] = useState({ ...APRESENTACAO_PADRAO, ...b.apresentacao })
  const [erroArq, setErroArq] = useState(''); const [lendo, setLendo] = useState(false); const input = useRef<HTMLInputElement>(null)
  const soltar = (url: string) => { if (url.startsWith('blob:') && url !== b.apresentacao?.musicaUrl) URL.revokeObjectURL(url) }
  async function escolher(e: { target: HTMLInputElement }) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setErroArq(''); setLendo(true)
    try { const r = await prepararArquivoAudio(file); soltar(f.musicaUrl); setF({ ...f, musicaUrl: r.url, musicaArquivo: r.nome, musicaAtiva: true, musicaTitulo: f.musicaTitulo || r.nome.replace(/\.[^.]+$/, '') }) }
    catch (err) { setErroArq((err as Error).message) } finally { setLendo(false) }
  }
  const remover = () => { soltar(f.musicaUrl); setErroArq(''); setF({ ...f, musicaUrl: '', musicaArquivo: undefined, musicaAtiva: false }) }
  return (<form className="card" onSubmit={async e => { e.preventDefault(); if (await a.executar(() => configurarApresentacao(ctx!, b.id, f), 'Configuração salva.')) rec() }}>
    <h2>Modo apresentação do pódio</h2><p className="muted">O pódio e o ranking usam exatamente a mesma classificação. Defina o confete, o atraso entre as revelações e, se quiser, uma música que toca quando o 1º lugar é revelado.</p>
    <div className="form-grid">
      <label className="linha-acoes"><input type="checkbox" checked={f.confete} onChange={e => setF({ ...f, confete: e.target.checked })} /> Confete ativado</label>
      <Campo rotulo={`Volume (${Math.round(f.volume * 100)}%)`}><input type="range" min={0} max={1} step={0.05} value={f.volume} onChange={e => setF({ ...f, volume: +e.target.value })} /></Campo>
      <Campo rotulo="Atraso entre revelações (ms)"><input type="number" min={0} max={60000} step={100} value={f.atrasoMs} onChange={e => setF({ ...f, atrasoMs: +e.target.value })} /></Campo></div>
    <h3>Música do pódio</h3>
    <div className="musica-atual">
      <input ref={input} type="file" accept={AUDIO_ACCEPT} onChange={escolher} hidden aria-label="Arquivo de áudio" />
      {f.musicaUrl ? <>
        <p><b>♪ {f.musicaArquivo ?? 'Link externo'}</b></p>
        <audio controls src={f.musicaUrl} aria-label="Pré-escuta da música" />
        <label className="linha-acoes"><input type="checkbox" checked={f.musicaAtiva} onChange={e => setF({ ...f, musicaAtiva: e.target.checked })} /> Tocar esta música na apresentação</label>
        <Campo rotulo="Título exibido"><input value={f.musicaTitulo} onChange={e => setF({ ...f, musicaTitulo: e.target.value })} /></Campo>
        <div className="acoes"><button type="button" className="ghost" disabled={lendo} onClick={() => input.current?.click()}>Trocar arquivo</button><button type="button" className="perigo pequeno" onClick={remover}>Remover música</button></div></>
        : <><p className="muted">Nenhuma música escolhida: será usado o som padrão. Envie o arquivo de áudio que você baixou.</p>
          <button type="button" disabled={lendo} onClick={() => input.current?.click()}>{lendo ? 'Lendo arquivo…' : 'Escolher arquivo de áudio'}</button></>}
      <p className="muted small">Formatos: MP3, WAV ou OGG, até 20 MB. Confira a pré-escuta acima antes de salvar.</p>
      {erroArq && <p role="alert" className="erro">{erroArq}</p>}
      <details><summary className="small">Usar link direto de um arquivo na internet (avançado)</summary>
        <Campo rotulo="Link direto do arquivo" dica="Precisa terminar em .mp3, .wav ou .ogg. Links do YouTube, Spotify ou Google Drive não tocam; prefira enviar o arquivo."><input type="url" value={f.musicaUrl.startsWith('blob:') ? '' : f.musicaUrl} placeholder="https://…/musica.mp3" onChange={e => { soltar(f.musicaUrl); setF({ ...f, musicaUrl: e.target.value, musicaArquivo: undefined, musicaAtiva: !!e.target.value }) }} /></Campo></details>
    </div>
    <Aviso msg={a.msg} /><button disabled={a.ocupado || lendo}>Salvar</button></form>)
}

function Convites({ b }: { b: Banca }) {
  const { ctx } = useAuth(); const projs = (useCarregar(() => listarProjetos(ctx!), [ctx]).dados ?? []).filter(p => b.projetoIds.includes(p.id)); const [pid, setPid] = useState(0)
  const escolhido = pid || projs[0]?.id || 0
  if (b.status === 'encerrada' || b.status === 'publicada') return <p className="aviso-topo">Esta banca já foi encerrada: não é mais possível convidar avaliadores.</p>
  if (!projs.length) return <p className="vazio">Inclua ao menos um projeto na banca (aba “Projetos e avaliadores”) para convidar avaliadores.</p>
  return (<div className="card stack"><h2>Convidar avaliador</h2><p className="muted">O convidado se cadastra com nome e e-mail e avalia <b>somente o projeto escolhido</b>, sem precisar de aprovação.</p>
    <Campo rotulo="Projeto que ele poderá avaliar"><select value={escolhido} onChange={e => setPid(+e.target.value)}>{projs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Campo>
    <ConviteAvaliador bancaId={b.id} projetoId={escolhido} /></div>)
}

function Progresso({ b }: { b: Banca }) {
  const { ctx } = useAuth(); const a = useAcao(); const { dados: p, erro, recarregar } = useCarregar(() => progressoBanca(ctx!, b.id), [ctx, b.id, b.status])
  const [alvo, setAlvo] = useState<number>(); const [motivo, setMotivo] = useState('')
  if (erro) return <Erro texto={erro} />; if (!p) return <p>Carregando…</p>
  if (!p.total) return <p className="vazio">Designe projetos e avaliadores para acompanhar o andamento.</p>
  return (<div className="stack"><p><b>{p.concluidas}</b> de <b>{p.total}</b> avaliações concluídas ({Math.round((p.concluidas / p.total) * 100)}%).</p>
    <div className="tabela-wrap"><table className="matriz"><thead><tr><th>Projeto</th>{p.avaliadores.map(x => <th key={x.id}>{x.nome}</th>)}</tr></thead>
      <tbody>{p.projetos.map(pr => <tr key={pr.id}><td>{pr.nome}</td>{p.avaliadores.map(av => { const c = p.celulas.find(x => x.projetoId === pr.id && x.avaliadorId === av.id)!
        return <td key={av.id}>{c.estado === 'enviada' ? <><span className="cel-ok">✔ {c.media?.toFixed(2)}</span>{b.status !== 'publicada' && <><br /><button className="link small" onClick={() => { setAlvo(c.avaliacaoId); setMotivo(''); a.limpar() }}>invalidar</button></>}</> : <span className="cel-pend">pendente</span>}</td> })}</tr>)}</tbody></table></div>
    {alvo && <section className="card"><h2>Invalidar avaliação #{alvo}</h2><p className="muted">A nota deixa de contar no ranking e o avaliador pode reenviar. Nada é apagado; a justificativa fica na auditoria.</p>
      <Campo rotulo="Justificativa"><input value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo><Aviso msg={a.msg} />
      <div className="acoes"><button className="perigo" onClick={async () => { if (await a.executar(() => invalidarAvaliacao(ctx!, alvo, motivo), 'Avaliação invalidada.')) { setAlvo(undefined); recarregar() } }}>Invalidar</button><button className="ghost" onClick={() => setAlvo(undefined)}>Cancelar</button></div></section>}
    <Aviso msg={alvo ? undefined : a.msg} /></div>)
}
export type { Criterio }
