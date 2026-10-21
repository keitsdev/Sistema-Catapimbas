import { useEffect, useMemo, useState } from 'react'
import { listarProjetos } from '../api'
import { useAuth } from '../auth'
import type { Projeto } from '../types'

const POR_PAGINA = 4
const STATUS = { em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado' }
export default function Projetos() {
  const { ctx } = useAuth()
  const [lista, setLista] = useState<Projeto[]>([]); const [busca, setBusca] = useState('')
  const [ano, setAno] = useState(0); const [sem, setSem] = useState(0); const [asc, setAsc] = useState(true)
  const [pag, setPag] = useState(1); const [sel, setSel] = useState<Projeto>()
  useEffect(() => { listarProjetos(ctx!, { busca, ano: ano || undefined, semestre: sem || undefined }).then(l => { setLista(l); setPag(1) }) }, [ctx, busca, ano, sem])
  const ordenada = useMemo(() => [...lista].sort((a, b) => a.nome.localeCompare(b.nome) * (asc ? 1 : -1)), [lista, asc])
  const paginas = Math.max(1, Math.ceil(ordenada.length / POR_PAGINA))
  const visiveis = ordenada.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA)
  return (
    <>
      <h1>Projetos</h1>
      <div className="filtros">
        <label>Buscar por nome, orientador ou aluno<input value={busca} onChange={e => setBusca(e.target.value)} /></label>
        <label>Ano<select value={ano} onChange={e => setAno(+e.target.value)}><option value={0}>Todos</option><option>2025</option><option>2026</option></select></label>
        <label>Semestre<select value={sem} onChange={e => setSem(+e.target.value)}><option value={0}>Todos</option><option value={1}>1º</option><option value={2}>2º</option></select></label>
      </div>
      {!visiveis.length ? <p className="vazio">Nenhum projeto encontrado com esses filtros.</p> : (
        <div className="tabela-wrap"><table>
          <thead><tr><th><button className="link" onClick={() => setAsc(!asc)}>Projeto {asc ? '▲' : '▼'}</button></th><th>Orientador</th><th>Período</th><th>Situação</th></tr></thead>
          <tbody>{visiveis.map(p => <tr key={p.id}>
            <td><button className="link" onClick={() => setSel(p)}>{p.nome}</button></td><td>{p.orientador}</td><td>{p.ano}/{p.semestre}</td><td><span className={`tag ${p.status}`}>{STATUS[p.status]}</span></td></tr>)}</tbody>
        </table></div>)}
      <div className="pager"><button className="ghost" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>Anterior</button>
        <span>Página {pag} de {paginas}</span><button className="ghost" disabled={pag >= paginas} onClick={() => setPag(pag + 1)}>Próxima</button></div>
      {sel && <aside className="card detalhe" aria-live="polite"><h2>{sel.nome}</h2><p>{sel.descricao}</p>
        <p><b>Orientador:</b> {sel.orientador}</p><p><b>Equipe:</b> {sel.equipe.join(', ')}</p><button className="ghost" onClick={() => setSel(undefined)}>Fechar</button></aside>}
    </>
  )
}
