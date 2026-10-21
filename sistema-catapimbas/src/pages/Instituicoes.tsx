import { useEffect, useState } from 'react'
import { listarInstituicoes } from '../api'
import { useAuth } from '../auth'
import type { Instituicao } from '../types'

export default function Instituicoes() {
  const { ctx } = useAuth(); const [l, setL] = useState<Instituicao[]>([])
  useEffect(() => { listarInstituicoes(ctx!).then(setL) }, [ctx])
  return (<>
    <h1>Instituições</h1>
    <div className="tabela-wrap"><table><thead><tr><th>Nome</th><th>Identificador</th><th>Situação</th></tr></thead>
      <tbody>{l.map(i => <tr key={i.id}><td>{i.nome}</td><td>{i.identificador}</td><td><span className={`tag ${i.status}`}>{i.status === 'ativa' ? 'Ativa' : 'Suspensa'}</span></td></tr>)}</tbody></table></div>
    <p className="muted small">Criar, ativar e suspender instituições será ligado a POST/PATCH /instituicoes.</p>
  </>)
}
