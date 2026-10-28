import React, { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import ExcelJS from 'exceljs'
import { listarBancas, publicarBanca, ranking } from '../api'
import { useAuth } from '../auth'
import { APRESENTACAO_PADRAO, obterApresentacao } from '../servicos/bancas'
import type { Banca, LinhaRanking } from '../types'

const MEDALHA = ['', 'Ouro', 'Prata', 'Bronze']
function tocar(ac?: AudioContext) {
  const a = ac ?? new AudioContext();[523, 659, 784, 1047].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; o.connect(g); g.connect(a.destination)
    g.gain.setValueAtTime(0.15, a.currentTime + i * 0.18); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + i * 0.18 + 0.4); o.start(a.currentTime + i * 0.18); o.stop(a.currentTime + i * 0.18 + 0.45) })
}
export default function Resultados() {
  const { ctx } = useAuth()
  const [bancas, setBancas] = useState<Banca[]>([]); const [id, setId] = useState(0)
  const [linhas, setLinhas] = useState<LinhaRanking[]>([]); const [erro, setErro] = useState('')
  const [mudo, setMudo] = useState(false); const [apresentando, setApresentando] = useState(false); const [rev, setRev] = useState(0);
  const timer = useRef<number | undefined>(undefined); const musica = useRef<HTMLAudioElement | undefined>(undefined); const [ap, setAp] = useState(APRESENTACAO_PADRAO); const acRef = useRef<AudioContext | undefined>(undefined); const [aviso, setAviso] = useState('');
  const carregar = (bid: number) => { setErro(''); ranking(ctx!, bid).then(setLinhas).catch(e => { setLinhas([]); setErro(e.message) }) }
  useEffect(() => { listarBancas(ctx!).then(b => { setBancas(b); if (b[0]) setId(b[0].id) }) }, [ctx])
  useEffect(() => { if (id) { carregar(id); obterApresentacao(ctx!, id).then(setAp).catch(() => setAp(APRESENTACAO_PADRAO)) } }, [id])
  useEffect(() => () => { clearTimeout(timer.current); musica.current?.pause() }, [])
  const gestor = ctx!.papel === 'admin' || ctx!.papel === 'coordenador'
  const banca = bancas.find(b => b.id === id)
  const podio = [2, 1, 3].map(pos => ({ pos, itens: linhas.filter(l => l.posicao === pos) }))

  function iniciar() {
    setApresentando(true); setRev(0); setAviso(''); clearTimeout(timer.current); musica.current?.pause(); musica.current = undefined
    acRef.current ??= new AudioContext(); acRef.current.resume().catch(() => undefined)
    let au: HTMLAudioElement | undefined
    if (ap.musicaAtiva && ap.musicaUrl) {
      au = new Audio(ap.musicaUrl); au.volume = ap.volume; au.preload = 'auto'; au.muted = true; musica.current = au
      au.play().then(() => { au!.pause(); au!.currentTime = 0; au!.muted = false }).catch(() => { au!.muted = false })
    }
    const somDoPodio = () => { if (!au) return tocar(acRef.current); au.play().catch(() => { setAviso('Não foi possível tocar a música configurada (arquivo ou link inválido). Foi usado o som padrão.'); tocar(acRef.current) }) }
    const passo = (n: number) => { setRev(n); if (n >= 1) { if (ap.confete && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 } }); if (!mudo && n === 3) somDoPodio() } if (n < 3) timer.current = window.setTimeout(() => passo(n + 1), ap.atrasoMs) }
    timer.current = window.setTimeout(() => passo(1), 400)
  }
  async function exportar() {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Ranking')
    ws.columns = [{ header: 'Posição', key: 'p', width: 10 }, { header: 'Projeto', key: 'n', width: 28 }, { header: 'Orientador', key: 'o', width: 22 }, { header: 'Pontuação', key: 's', width: 12 }, { header: 'Avaliações', key: 'a', width: 12 }]
    linhas.forEach(l => ws.addRow({ p: l.posicao, n: l.projeto.nome, o: l.projeto.orientador, s: l.pontuacao, a: l.avaliacoes })); ws.getRow(1).font = { bold: true }
    const url = URL.createObjectURL(new Blob([(await wb.xlsx.writeBuffer()) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    Object.assign(document.createElement('a'), { href: url, download: 'ranking.xlsx' }).click(); URL.revokeObjectURL(url)
  }
  return (
    <>
      <h1>Resultados</h1>
      <div className="filtros">
        <label>Banca<select value={id} onChange={e => setId(+e.target.value)}>{bancas.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
        {banca && <p className="muted">Situação: <b>{banca.status === 'publicada' ? 'Publicada' : banca.status === 'aberta' ? 'Rascunho (aberta)' : 'Rascunho'}</b></p>}
        {gestor && banca?.status !== 'publicada' && <button onClick={async () => { await publicarBanca(ctx!, id); setBancas(await listarBancas(ctx!)); carregar(id) }}>Publicar resultado</button>}
      </div>
      {erro && <p role="alert" className="erro">{erro}</p>}
      {!!linhas.length && <>
        <div className="tabela-wrap"><table><thead><tr><th>Posição</th><th>Projeto</th><th>Pontuação</th><th>Avaliações</th></tr></thead>
          <tbody>{linhas.map(l => <tr key={l.projeto.id}><td>{l.posicao}º</td><td>{l.projeto.nome}</td><td>{l.pontuacao.toFixed(2)}</td><td>{l.avaliacoes}</td></tr>)}</tbody></table></div>
        <p className="muted small">Pontuação = média dos avaliadores; cada avaliador usa a média ponderada pelos pesos. Empates compartilham a posição.</p>
        <div className="acoes"><button onClick={exportar}>Exportar Excel</button><button className="ghost" onClick={iniciar}>{apresentando ? 'Repetir animação' : 'Modo apresentação do pódio'}</button>
          <button className="ghost" aria-pressed={mudo} onClick={() => { if (!mudo) musica.current?.pause(); setMudo(!mudo) }}>{mudo ? 'Ativar som' : 'Silenciar'}</button></div>
        {aviso && <p role="status" className="aviso-topo">{aviso}</p>}
        {apresentando && ap.musicaAtiva && ap.musicaUrl && <p className="muted small">♪ {ap.musicaTitulo || ap.musicaArquivo || 'Música do pódio'}</p>}
        {apresentando && <section className="podio" aria-label="Pódio">{podio.map(({ pos, itens }) => (
          <div key={pos} className={`degrau p${pos} ${(rev >= 4 - pos) ? 'on' : ''}`} style={{ '--h': `${pos === 1 ? 220 : pos === 2 ? 160 : 120}px` } as React.CSSProperties}>
            <div className="nomes">{itens.map(i => <b key={i.projeto.id}>{i.projeto.nome}</b>)}{!itens.length && <em>—</em>}</div>
            <div className="bloco"><span>{MEDALHA[pos]}</span></div></div>))}</section>}
      </>}
    </>
  )
}
