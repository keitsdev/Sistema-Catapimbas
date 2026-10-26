import { useState, type FormEvent } from 'react'
import { Aviso, Campo, Erro, Tag, useAcao, useCarregar } from '../components/ui'
import { useAuth } from '../auth'
import { atualizarInstituicao, criarInstituicao, definirStatusInstituicao, designarAdmin } from '../servicos/plataforma'
import { listarInstituicoes } from '../api'
import type { Instituicao } from '../types'

const VAZIO = { nome: '', identificador: '', cor: '#0e7c7b', lema: '' }
const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function Instituicoes() {
  const { ctx } = useAuth(); const { dados: l = [], erro, recarregar } = useCarregar(() => listarInstituicoes(ctx!), [ctx])
  const [edit, setEdit] = useState<Instituicao | 'nova'>(); const [f, setF] = useState(VAZIO); const a = useAcao()
  const [susp, setSusp] = useState<Instituicao>(); const [motivo, setMotivo] = useState('')
  const [adm, setAdm] = useState<Instituicao>(); const [email, setEmail] = useState('')
  const abrir = (i: Instituicao | 'nova') => { setEdit(i); a.limpar(); setF(i === 'nova' ? VAZIO : { nome: i.nome, identificador: i.identificador, cor: i.cor ?? '#0e7c7b', lema: i.lema ?? '' }) }
  async function salvar(e: FormEvent) { e.preventDefault(); if (await a.executar(() => edit === 'nova' ? criarInstituicao(ctx!, f) : atualizarInstituicao(ctx!, (edit as Instituicao).id, f), 'Instituição salva.')) { setEdit(undefined); recarregar() } }
  async function mudar(i: Instituicao, status: Instituicao['status']) { if (await a.executar(() => definirStatusInstituicao(ctx!, i.id, status, motivo), status === 'ativa' ? 'Instituição ativada.' : 'Instituição suspensa.')) { setSusp(undefined); setMotivo(''); recarregar() } }
  return (<>
    <div className="cab"><h1>Instituições</h1><button onClick={() => abrir('nova')}>Nova instituição</button></div>
    <Erro texto={erro} /><Aviso msg={edit || susp || adm ? undefined : a.msg} />
    <div className="tabela-wrap"><table><thead><tr><th>Nome</th><th>Identificador</th><th>Situação</th><th>Ações</th></tr></thead>
      <tbody>{l.map(i => <tr key={i.id}><td><span className="tema-marca" style={{ background: i.cor }} />{i.nome}</td><td>{i.identificador}</td>
        <td><span className={`tag ${i.status}`}>{i.status === 'ativa' ? 'Ativa' : 'Suspensa'}</span></td>
        <td className="td-acoes"><div className="linha-acoes"><button className="ghost pequeno" onClick={() => abrir(i)}>Editar</button>
          <button className="ghost pequeno" onClick={() => { setAdm(i); setEmail(''); a.limpar() }}>Designar admin</button>
          {i.status === 'ativa' ? <button className="perigo pequeno" onClick={() => { setSusp(i); setMotivo(''); a.limpar() }}>Suspender</button> : <button className="pequeno" onClick={() => mudar(i, 'ativa')}>Ativar</button>}</div></td></tr>)}</tbody></table></div>
    {edit && <form className="card detalhe" onSubmit={salvar}><h2>{edit === 'nova' ? 'Nova instituição' : `Editar ${edit.nome}`}</h2>
      <div className="form-grid">
        <Campo rotulo="Nome"><input required minLength={3} value={f.nome} onChange={e => setF({ ...f, nome: e.target.value, identificador: edit === 'nova' ? slug(e.target.value) : f.identificador })} /></Campo>
        <Campo rotulo="Identificador único" dica="Minúsculas, números e hifens."><input required value={f.identificador} onChange={e => setF({ ...f, identificador: e.target.value })} /></Campo>
        <Campo rotulo="Cor principal (identidade visual)"><input type="color" value={f.cor} onChange={e => setF({ ...f, cor: e.target.value })} /></Campo>
        <Campo rotulo="Lema (opcional)"><input value={f.lema} onChange={e => setF({ ...f, lema: e.target.value })} /></Campo></div>
      <Aviso msg={a.msg} /><div className="acoes"><button disabled={a.ocupado}>Salvar</button><button type="button" className="ghost" onClick={() => setEdit(undefined)}>Cancelar</button></div></form>}
    {susp && <section className="card detalhe" aria-live="polite"><h2>Suspender {susp.nome}</h2><p className="muted">Todos os usuários perdem o acesso imediatamente; os dados são preservados e a instituição pode ser reativada.</p>
      <Campo rotulo="Motivo (obrigatório)"><input value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo><Aviso msg={a.msg} />
      <div className="acoes"><button className="perigo" onClick={() => mudar(susp, 'suspensa')}>Confirmar suspensão</button><button className="ghost" onClick={() => setSusp(undefined)}>Cancelar</button></div></section>}
    {adm && <section className="card detalhe"><h2>Designar administrador de {adm.nome}</h2><p className="muted">O usuário já precisa ter conta. Ele passa a administrar esta instituição.</p>
      <Campo rotulo="E-mail do usuário"><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Campo><Aviso msg={a.msg} />
      <div className="acoes"><button onClick={async () => { if (await a.executar(() => designarAdmin(ctx!, adm.id, email), 'Administrador designado.')) setEmail('') }}>Designar</button><button className="ghost" onClick={() => setAdm(undefined)}>Fechar</button></div></section>}
  </>)
}
