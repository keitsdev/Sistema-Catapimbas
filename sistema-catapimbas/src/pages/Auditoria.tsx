import { useState } from 'react'
import { Campo, Erro, Pager, useCarregar, usePagina, dataHora } from '../components/ui'
import { useAuth } from '../auth'
import { instituicoes } from '../api'
import { listarAuditoria } from '../servicos/plataforma'

const GRUPOS: [string, string][] = [['', 'Todas'], ['vinculo', 'Vínculos e permissões'], ['avaliacao', 'Avaliações e notas'], ['banca', 'Bancas'], ['projeto', 'Projetos'], ['instituicao', 'Instituições'], ['login', 'Acessos'], ['lgpd', 'LGPD']]

export default function Auditoria() {
  const { ctx } = useAuth(); const [acao, setAcao] = useState(''); const [inst, setInst] = useState(0); const su = ctx!.papel === 'superadmin'
  const { dados = [], erro } = useCarregar(() => listarAuditoria(ctx!, { acao: acao || undefined, instituicaoId: inst || undefined }), [ctx, acao, inst])
  const pg = usePagina(dados, 12)
  return (<>
    <h1>Auditoria</h1>
    <div className="filtros"><Campo rotulo="Tipo de operação"><select value={acao} onChange={e => setAcao(e.target.value)}>{GRUPOS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></Campo>
      {su && <Campo rotulo="Instituição"><select value={inst} onChange={e => setInst(+e.target.value)}><option value={0}>Todas</option>{instituicoes.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}</select></Campo>}</div>
    <Erro texto={erro} />
    {!pg.visiveis.length ? <p className="vazio">Nenhum registro encontrado.</p> : <div className="tabela-wrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>Operação</th><th>Alvo</th><th>Detalhe</th></tr></thead>
      <tbody>{pg.visiveis.map(r => <tr key={r.id}><td>{dataHora(r.quando)}</td><td>{r.atorNome}</td><td><code>{r.acao}</code></td><td>{r.entidade} #{r.entidadeId}</td><td className="small">{r.detalhe ?? '—'}</td></tr>)}</tbody></table></div>}
    <Pager {...pg} />
    <p className="muted small">Registros somente de inclusão: não podem ser editados nem apagados pela aplicação. Senhas e tokens nunca são gravados.</p>
  </>)
}
