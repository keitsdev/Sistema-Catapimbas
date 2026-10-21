import { useEffect, useState } from 'react'
import { enviarAvaliacao, listarBancas, listarProjetos, minhasAvaliacoes } from '../api'
import { useAuth } from '../auth'
import type { Banca, Projeto } from '../types'

export default function Avaliar() {
  const { ctx } = useAuth()
  const [bancas, setBancas] = useState<Banca[]>([]); const [projetos, setProjetos] = useState<Projeto[]>([])
  const [bancaId, setBancaId] = useState(0); const [projetoId, setProjetoId] = useState(0)
  const [feitas, setFeitas] = useState<number[]>([]); const [notas, setNotas] = useState<Record<number, number>>({})
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>(); const [recibo, setRecibo] = useState<string>()
  useEffect(() => { listarBancas(ctx!).then(b => { const meus = b.filter(x => x.avaliadorIds.includes(ctx!.usuarioId) && x.status === 'aberta'); setBancas(meus); if (meus[0]) setBancaId(meus[0].id) }); listarProjetos(ctx!).then(setProjetos) }, [ctx])
  const banca = bancas.find(b => b.id === bancaId)
  useEffect(() => { if (bancaId) minhasAvaliacoes(ctx!, bancaId).then(a => setFeitas(a.map(x => x.projetoId))); setNotas({}); setProjetoId(0); setRecibo(undefined) }, [bancaId, ctx])
  if (!banca) return <><h1>Avaliar</h1><p className="vazio">Você não tem bancas abertas atribuídas.</p></>
  const doProjeto = projetos.filter(p => banca.projetoIds.includes(p.id))
  const completo = banca.criterios.every(c => notas[c.id])
  async function enviar() {
    if (!window.confirm('Confirmar o envio? Depois disso a nota só muda por correção auditada.')) return
    try { const r = await enviarAvaliacao(ctx!, bancaId, projetoId, notas); setFeitas([...feitas, projetoId]); setRecibo(`Recibo #${r.id} · ${new Date(r.criadaEm).toLocaleString('pt-BR')}`); setMsg(undefined) }
    catch (e) { setMsg({ ok: false, t: (e as Error).message }) }
  }
  return (
    <>
      <h1>Avaliar</h1>
      <div className="filtros">
        <label>Banca<select value={bancaId} onChange={e => setBancaId(+e.target.value)}>{bancas.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></label>
        <label>Projeto<select value={projetoId} onChange={e => { setProjetoId(+e.target.value); setNotas({}); setRecibo(undefined); setMsg(undefined) }}>
          <option value={0}>Selecione…</option>{doProjeto.map(p => <option key={p.id} value={p.id}>{p.nome}{feitas.includes(p.id) ? ' (avaliado)' : ''}</option>)}</select></label>
      </div>
      {recibo && <p className="ok" role="status">Avaliação enviada. {recibo}</p>}
      {projetoId > 0 && !feitas.includes(projetoId) && (
        <div className="form-av">
          {banca.criterios.map(c => (
            <fieldset key={c.id} className="card"><legend>{c.titulo}</legend>
              <div className="escala" role="radiogroup" aria-label={c.titulo}>
                {[1, 2, 3, 4, 5].map(n => <label key={n} className={notas[c.id] === n ? 'on' : ''}><input type="radio" name={`c${c.id}`} checked={notas[c.id] === n} onChange={() => setNotas({ ...notas, [c.id]: n })} /><b>{n}</b><span>{c.descritores[n]}</span></label>)}
              </div></fieldset>))}
          {msg && <p role="alert" className="erro">{msg.t}</p>}
          <button disabled={!completo} onClick={enviar}>Enviar avaliação</button>
        </div>)}
      {projetoId > 0 && feitas.includes(projetoId) && !recibo && <p className="muted">Você já avaliou este projeto. Para corrigir, peça ao coordenador.</p>}
    </>
  )
}
