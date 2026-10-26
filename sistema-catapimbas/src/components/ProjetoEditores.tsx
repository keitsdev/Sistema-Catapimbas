import { useState, type FormEvent } from 'react'
import { Aviso, Campo, useAcao, useCarregar } from './ui'
import { useAuth } from '../auth'
import { atualizarProjeto, criarProjeto, definirEquipe } from '../servicos/projetos'
import { diretorio } from '../servicos/acesso'
import type { Projeto } from '../types'

export function ProjetoForm({ projeto, onFim }: { projeto?: Projeto; onFim(salvo: boolean): void }) {
  const { ctx } = useAuth(); const a = useAcao()
  const [f, setF] = useState({ nome: projeto?.nome ?? '', descricao: projeto?.descricao ?? '', ano: projeto?.ano ?? new Date().getFullYear(), semestre: (projeto?.semestre ?? 1) as 1 | 2, status: (projeto?.status === 'concluido' ? 'concluido' : 'em_andamento') as 'em_andamento' | 'concluido' })
  async function salvar(e: FormEvent) { e.preventDefault(); if (await a.executar(() => projeto ? atualizarProjeto(ctx!, projeto.id, f) : criarProjeto(ctx!, f), 'Projeto salvo.')) onFim(true) }
  return (
    <form className="card detalhe" onSubmit={salvar}><h2>{projeto ? `Editar ${projeto.nome}` : 'Novo projeto'}</h2>
      <div className="form-grid">
        <Campo rotulo="Nome"><input required minLength={2} maxLength={180} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Ano"><input type="number" required min={2000} max={2100} value={f.ano} onChange={e => setF({ ...f, ano: +e.target.value })} /></Campo>
        <Campo rotulo="Semestre"><select value={f.semestre} onChange={e => setF({ ...f, semestre: +e.target.value as 1 | 2 })}><option value={1}>1º</option><option value={2}>2º</option></select></Campo>
        <Campo rotulo="Situação"><select value={f.status} onChange={e => setF({ ...f, status: e.target.value as typeof f.status })}><option value="em_andamento">Em andamento</option><option value="concluido">Concluído</option></select></Campo>
        <div className="largo"><Campo rotulo="Descrição" dica="Mínimo de 10 caracteres."><textarea required minLength={10} maxLength={5000} value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></Campo></div>
      </div><Aviso msg={a.msg} />
      <div className="acoes"><button disabled={a.ocupado}>Salvar</button><button type="button" className="ghost" onClick={() => onFim(false)}>Cancelar</button></div></form>)
}

export function EquipeEditor({ projeto, onFim }: { projeto: Projeto; onFim(salvo: boolean): void }) {
  const { ctx } = useAuth(); const a = useAcao()
  const alunos = useCarregar(() => diretorio(ctx!, 'aluno'), [ctx]).dados ?? []; const orient = useCarregar(() => diretorio(ctx!, 'orientador'), [ctx]).dados ?? []
  const [ori, setOri] = useState(projeto.orientadorId ?? 0); const [sel, setSel] = useState<Record<number, string>>(Object.fromEntries((projeto.equipeIds ?? []).map(id => [id, projeto.funcoes?.[id] ?? 'Integrante'])))
  const alternar = (id: number) => setSel(s => { const n = { ...s }; if (id in n) delete n[id]; else n[id] = 'Integrante'; return n })
  return (
    <section className="card detalhe"><h2>Equipe de {projeto.nome}</h2>
      <Campo rotulo="Orientador"><select value={ori} onChange={e => setOri(+e.target.value)}><option value={0}>— sem orientador —</option>{orient.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></Campo>
      <h3 className="small">Integrantes (alunos)</h3>
      {!alunos.length ? <p className="vazio">Não há alunos aprovados nesta instituição.</p> : <div className="lista-check">{alunos.map(al => (
        <label key={al.id}><input type="checkbox" checked={al.id in sel} onChange={() => alternar(al.id)} />{al.nome}
          {al.id in sel && <input aria-label={`Função de ${al.nome}`} className="pequeno" style={{ width: '8rem' }} value={sel[al.id]} onChange={e => setSel({ ...sel, [al.id]: e.target.value })} />}</label>))}</div>}
      <Aviso msg={a.msg} />
      <div className="acoes"><button disabled={a.ocupado} onClick={async () => { if (await a.executar(() => definirEquipe(ctx!, projeto.id, { orientadorId: ori || undefined, alunos: Object.entries(sel).map(([id, funcao]) => ({ id: +id, funcao })) }), 'Equipe atualizada.')) onFim(true) }}>Salvar equipe</button><button className="ghost" onClick={() => onFim(false)}>Cancelar</button></div></section>)
}
