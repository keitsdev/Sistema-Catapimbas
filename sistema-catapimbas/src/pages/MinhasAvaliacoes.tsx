import { useState } from 'react'
import { Aviso, Erro, Tag, dataHora, useAcao, useCarregar } from '../components/ui'
import { useAuth } from '../auth'
import { minhasAvaliacoesDetalhadas, revisarAvaliacao } from '../servicos/bancas'

export default function MinhasAvaliacoes() {
  const { ctx } = useAuth(); const { dados = [], erro, recarregar } = useCarregar(() => minhasAvaliacoesDetalhadas(ctx!), [ctx])
  const [editId, setEditId] = useState<number>(); const [notas, setNotas] = useState<Record<number, number>>({}); const a = useAcao()
  return (<>
    <h1>Minhas avaliações</h1><Erro texto={erro} />
    {!dados.length ? <p className="vazio">Você ainda não enviou avaliações.</p> : dados.map(av => {
      const aberta = av.banca.status === 'aberta'; const editando = editId === av.id
      return (<section className="card detalhe" key={av.id}>
        <div className="cab"><h2>{av.projeto.nome}</h2><span><Tag valor={av.banca.status} rotulo={`Banca ${av.banca.status}`} /> <span className="muted small">Recibo #{av.id} · v{av.versao ?? 1} · {dataHora(av.criadaEm)}</span></span></div>
        <p className="muted small">{av.banca.nome}</p>
        <ul>{av.banca.criterios.map(c => <li key={c.id}>{c.titulo}: {editando
          ? <select aria-label={c.titulo} value={notas[c.id] ?? ''} onChange={e => setNotas({ ...notas, [c.id]: +e.target.value })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} – {c.descritores[n]}</option>)}</select>
          : <b>{av.notas[c.id]}</b>}</li>)}</ul>
        {editando && <Aviso msg={a.msg} />}
        <div className="acoes">{!editando && aberta && <button className="ghost" onClick={() => { setEditId(av.id); setNotas({ ...av.notas }); a.limpar() }}>Corrigir notas</button>}
          {!aberta && <span className="muted small">Banca fechada: correções não são mais permitidas.</span>}
          {editando && <><button disabled={a.ocupado} onClick={async () => { if (await a.executar(() => revisarAvaliacao(ctx!, av.id, notas), 'Correção registrada e auditada.')) { setEditId(undefined); recarregar() } }}>Salvar correção</button><button className="ghost" onClick={() => setEditId(undefined)}>Cancelar</button></>}</div>
      </section>)})}
  </>)
}
