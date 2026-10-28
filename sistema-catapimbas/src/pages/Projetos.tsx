import { useMemo, useState } from 'react'
import { listarProjetos } from '../api'
import { useAuth } from '../auth'
import { Aviso, Campo, Erro, baixarXlsx, useAcao, useCarregar } from '../components/ui'
import { EquipeEditor, ProjetoForm } from '../components/ProjetoEditores'
import { ConvitePorProjeto } from '../components/ConviteAvaliador'
import { diretorio } from '../servicos/acesso'
import { arquivarProjeto, atualizarProjetoAluno, dadosExportacaoProjetos } from '../servicos/projetos'
import type { Projeto } from '../types'

const POR_PAGINA = 4
const STATUS = { em_andamento: 'Em andamento', concluido: 'Concluído', arquivado: 'Arquivado' }
type Modo = 'nenhum' | 'novo' | 'editar' | 'equipe' | 'descricao' | 'arquivar' | 'convite'

export default function Projetos() {
  const { ctx } = useAuth(); const gestor = ctx!.papel === 'admin' || ctx!.papel === 'coordenador'
  const [busca, setBusca] = useState(''); const [ano, setAno] = useState(0); const [sem, setSem] = useState(0); const [asc, setAsc] = useState(true)
  const [alunoId, setAlunoId] = useState(0); const [orientadorId, setOrientadorId] = useState(0); const [status, setStatus] = useState('')
  const [pag, setPag] = useState(1); const [selId, setSelId] = useState<number>(); const [modo, setModo] = useState<Modo>('nenhum'); const [marcados, setMarcados] = useState<number[]>([])
  const [desc, setDesc] = useState(''); const a = useAcao()
  const { dados: lista = [], erro, recarregar } = useCarregar(() => listarProjetos(ctx!, { busca, ano: ano || undefined, semestre: sem || undefined, alunoId: alunoId || undefined, orientadorId: orientadorId || undefined, status: (status || undefined) as Projeto['status'] }), [ctx, busca, ano, sem, alunoId, orientadorId, status])
  const alunos = useCarregar(async () => gestor ? diretorio(ctx!, 'aluno') : [], [ctx]).dados ?? []; const orients = useCarregar(async () => gestor ? diretorio(ctx!, 'orientador') : [], [ctx]).dados ?? []
  const ordenada = useMemo(() => [...lista].sort((x, y) => x.nome.localeCompare(y.nome) * (asc ? 1 : -1)), [lista, asc])
  const paginas = Math.max(1, Math.ceil(ordenada.length / POR_PAGINA)); const pagina = Math.min(pag, paginas)
  const visiveis = ordenada.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const sel = lista.find(p => p.id === selId); const souDoProjeto = !!sel?.equipeIds?.includes(ctx!.usuarioId)
  const fim = (salvo: boolean) => { setModo('nenhum'); if (salvo) recarregar() }
  const filtro = (p: Projeto) => lista.some(x => x.id === p.id)
  async function exportar() {
    const linhas = await dadosExportacaoProjetos(ctx!, filtro, marcados.filter(id => lista.some(p => p.id === id)))
    await baixarXlsx('projetos.xlsx', 'Projetos', [{ header: 'Projeto', key: 'nome', width: 28 }, { header: 'Período', key: 'periodo', width: 10 }, { header: 'Situação', key: 'situacao', width: 14 }, { header: 'Orientador', key: 'orientador', width: 22 }, { header: 'Equipe', key: 'equipe', width: 40 }, { header: 'Descrição', key: 'descricao', width: 60 }], linhas as unknown as Record<string, unknown>[])
  }
  return (
    <>
      <div className="cab"><h1>{gestor ? 'Projetos' : 'Meus projetos'}</h1>{gestor && <button onClick={() => { setModo('novo'); setSelId(undefined) }}>Novo projeto</button>}</div>
      <div className="filtros">
        <label>Buscar por nome, orientador ou aluno<input value={busca} onChange={e => { setBusca(e.target.value); setPag(1) }} /></label>
        <label>Ano<select value={ano} onChange={e => { setAno(+e.target.value); setPag(1) }}><option value={0}>Todos</option><option>2025</option><option>2026</option></select></label>
        <label>Semestre<select value={sem} onChange={e => { setSem(+e.target.value); setPag(1) }}><option value={0}>Todos</option><option value={1}>1º</option><option value={2}>2º</option></select></label>
        <Campo rotulo="Situação"><select value={status} onChange={e => { setStatus(e.target.value); setPag(1) }}><option value="">Todas</option><option value="em_andamento">Em andamento</option><option value="concluido">Concluído</option></select></Campo>
        {gestor && <><Campo rotulo="Aluno"><select value={alunoId} onChange={e => { setAlunoId(+e.target.value); setPag(1) }}><option value={0}>Todos</option>{alunos.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo>
          <Campo rotulo="Orientador"><select value={orientadorId} onChange={e => { setOrientadorId(+e.target.value); setPag(1) }}><option value={0}>Todos</option>{orients.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></Campo></>}
      </div>
      <Erro texto={erro} />
      {modo === 'novo' && <ProjetoForm onFim={fim} />}
      {!visiveis.length ? <p className="vazio">{ctx!.papel === 'aluno' || ctx!.papel === 'orientador' ? 'Você ainda não está vinculado a nenhum projeto.' : 'Nenhum projeto encontrado com esses filtros.'}</p> : (
        <div className="tabela-wrap"><table>
          <thead><tr><th><span className="sr-only" style={{ position: 'absolute', left: -9999 }}>Selecionar</span></th><th><button className="link" onClick={() => setAsc(!asc)}>Projeto {asc ? '▲' : '▼'}</button></th><th>Orientador</th><th>Período</th><th>Situação</th></tr></thead>
          <tbody>{visiveis.map(p => <tr key={p.id}>
            <td><input type="checkbox" aria-label={`Selecionar ${p.nome} para exportar`} checked={marcados.includes(p.id)} onChange={() => setMarcados(m => m.includes(p.id) ? m.filter(x => x !== p.id) : [...m, p.id])} /></td>
            <td><button className="link" onClick={() => { setSelId(p.id); setModo('nenhum'); a.limpar() }}>{p.nome}</button></td><td>{p.orientador}</td><td>{p.ano}/{p.semestre}</td><td><span className={`tag ${p.status}`}>{STATUS[p.status]}</span></td></tr>)}</tbody>
        </table></div>)}
      <div className="pager"><button className="ghost" disabled={pagina <= 1} onClick={() => setPag(pagina - 1)}>Anterior</button>
        <span>Página {pagina} de {paginas}</span><button className="ghost" disabled={pagina >= paginas} onClick={() => setPag(pagina + 1)}>Próxima</button>
        <button className="ghost" disabled={!lista.length} onClick={exportar}>Exportar Excel ({marcados.filter(id => lista.some(p => p.id === id)).length ? 'selecionados' : 'filtrados'})</button></div>
      {sel && modo === 'nenhum' && <aside className="card detalhe" aria-live="polite"><h2>{sel.nome}</h2><p>{sel.descricao}</p>
        <p><b>Orientador:</b> {sel.orientador}</p>
        <p><b>Equipe:</b> {sel.equipeIds?.length ? sel.equipeIds.map(id => `${sel.equipe[sel.equipeIds!.indexOf(id)]} (${sel.funcoes?.[id] ?? 'Integrante'})`).join(', ') : (sel.equipe.join(', ') || '—')}</p>
        <Aviso msg={a.msg} />
        <div className="acoes"><button className="ghost" onClick={() => setSelId(undefined)}>Fechar</button>
          {gestor && <><button className="ghost" onClick={() => setModo('editar')}>Editar dados</button><button className="ghost" onClick={() => setModo('equipe')}>Equipe e orientador</button></>}
          {ctx!.papel === 'admin' && <button onClick={() => setModo('convite')}>Convidar avaliador</button>}
          {ctx!.papel === 'admin' && <button className="perigo" onClick={() => setModo('arquivar')}>Arquivar</button>}
          {ctx!.papel === 'aluno' && souDoProjeto && <button className="ghost" onClick={() => { setDesc(sel.descricao); setModo('descricao') }}>Editar descrição</button>}</div></aside>}
      {sel && modo === 'convite' && <ConvitePorProjeto projeto={sel} onFechar={() => setModo('nenhum')} />}
      {sel && modo === 'editar' && <ProjetoForm projeto={sel} onFim={fim} />}
      {sel && modo === 'equipe' && <EquipeEditor projeto={sel} onFim={fim} />}
      {sel && modo === 'descricao' && <section className="card detalhe"><h2>Descrição de {sel.nome}</h2><p className="muted small">Como integrante, você pode atualizar apenas a descrição.</p>
        <textarea aria-label="Descrição" value={desc} onChange={e => setDesc(e.target.value)} style={{ width: '100%' }} /><Aviso msg={a.msg} />
        <div className="acoes"><button onClick={async () => { if (await a.executar(() => atualizarProjetoAluno(ctx!, sel.id, { descricao: desc }), 'Descrição atualizada.')) fim(true) }}>Salvar</button><button className="ghost" onClick={() => setModo('nenhum')}>Cancelar</button></div></section>}
      {sel && modo === 'arquivar' && <section className="card detalhe"><h2>Arquivar {sel.nome}?</h2><p className="muted">O projeto deixa de aparecer nas listas, mas avaliações e rankings já realizados são preservados (exclusão lógica).</p><Aviso msg={a.msg} />
        <div className="acoes"><button className="perigo" onClick={async () => { if (await a.executar(() => arquivarProjeto(ctx!, sel.id), 'Projeto arquivado.')) { setSelId(undefined); fim(true) } }}>Confirmar arquivamento</button><button className="ghost" onClick={() => setModo('nenhum')}>Cancelar</button></div></section>}
    </>
  )
}
