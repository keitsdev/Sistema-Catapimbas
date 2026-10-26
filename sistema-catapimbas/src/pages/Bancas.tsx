import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Aviso, Campo, Erro, Tag, useAcao, useCarregar } from '../components/ui'
import { useAuth } from '../auth'
import { listarBancas } from '../api'
import { criarBanca } from '../servicos/bancas'
import { BANCA_LABEL } from '../types'

export default function Bancas() {
  const { ctx } = useAuth(); const nav = useNavigate(); const { dados = [], erro } = useCarregar(() => listarBancas(ctx!), [ctx])
  const [novo, setNovo] = useState(false); const a = useAcao()
  const [f, setF] = useState({ nome: '', inicio: '', fim: '', desempate: 'competicao' as 'competicao' | 'denso', precisao: 2 })
  async function criar(e: FormEvent) { e.preventDefault(); let id = 0; if (await a.executar(async () => { id = (await criarBanca(ctx!, f)).id }, 'Banca criada.')) nav(`/bancas/${id}`) }
  return (<>
    <div className="cab"><h1>Bancas</h1><button onClick={() => setNovo(!novo)}>{novo ? 'Fechar' : 'Nova banca'}</button></div>
    <Erro texto={erro} />
    {novo && <form className="card detalhe" onSubmit={criar}><h2>Nova banca</h2>
      <div className="form-grid">
        <div className="largo"><Campo rotulo="Nome"><input required minLength={3} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} placeholder="[DE 2026-1] Banca Final de Avaliação das Startups" /></Campo></div>
        <Campo rotulo="Início"><input type="date" required value={f.inicio} onChange={e => setF({ ...f, inicio: e.target.value })} /></Campo>
        <Campo rotulo="Término"><input type="date" required value={f.fim} onChange={e => setF({ ...f, fim: e.target.value })} /></Campo>
        <Campo rotulo="Política de empate" dica="Definida antes das notas e imutável depois."><select value={f.desempate} onChange={e => setF({ ...f, desempate: e.target.value as 'competicao' | 'denso' })}><option value="competicao">Competição (1, 1, 3)</option><option value="denso">Densa (1, 1, 2)</option></select></Campo>
        <Campo rotulo="Casas decimais da pontuação"><input type="number" min={0} max={4} value={f.precisao} onChange={e => setF({ ...f, precisao: +e.target.value })} /></Campo></div>
      <Aviso msg={a.msg} /><button disabled={a.ocupado}>Criar e configurar</button></form>}
    {!dados.length ? <p className="vazio">Nenhuma banca cadastrada. Crie a primeira para começar a avaliar.</p> : <div className="tabela-wrap"><table>
      <thead><tr><th>Banca</th><th>Período</th><th>Situação</th><th>Projetos</th><th>Avaliadores</th><th>Critérios</th></tr></thead>
      <tbody>{dados.map(b => <tr key={b.id}><td><Link to={`/bancas/${b.id}`}>{b.nome}</Link></td><td>{b.inicio ?? '—'} a {b.fim ?? '—'}</td><td><Tag valor={b.status} rotulo={BANCA_LABEL[b.status]} /></td><td>{b.projetoIds.length}</td><td>{b.avaliadorIds.length}</td><td>{b.criterios.length}</td></tr>)}</tbody></table></div>}
  </>)
}
