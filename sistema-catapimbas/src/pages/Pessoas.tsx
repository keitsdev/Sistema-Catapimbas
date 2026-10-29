import { useState } from 'react'
import { Aviso, Campo, Erro, Pager, Tag, useAcao, useCarregar, usePagina } from '../components/ui'
import { useAuth } from '../auth'
import { alterarPapel, alterarSituacao, PAPEIS_INSTITUCIONAIS, listarPessoas } from '../servicos/acesso'
import { PAPEL_LABEL, SITUACAO_LABEL, type Papel, type Pessoa } from '../types'

export default function Pessoas() {
  const { ctx, token } = useAuth(); const gestor = ctx!.papel === 'admin'
  const { dados = [], erro, recarregar } = useCarregar(() => listarPessoas(ctx!, token), [ctx, token])
  const [busca, setBusca] = useState(''); const [papel, setPapel] = useState(''); const [sit, setSit] = useState('')
  const [alvo, setAlvo] = useState<{ p: Pessoa; acao: 'bloqueado' | 'revogado' }>(); const [motivo, setMotivo] = useState(''); const a = useAcao()
  const filtrada = dados.filter(p => (!papel || p.papel === papel) && (!sit || p.situacao === sit) && (!busca || `${p.nome} ${p.email}`.toLowerCase().includes(busca.toLowerCase())))
  const pg = usePagina(filtrada)
  const rodar = async (fn: () => Promise<unknown>, ok: string) => { if (await a.executar(fn, ok)) { setAlvo(undefined); setMotivo(''); recarregar() } }
  return (<>
    <h1>Pessoas</h1>
    {!gestor && <p className="muted">Consulta apenas: alterações de papel e acesso são feitas pelo administrador.</p>}
    <div className="filtros">
      <Campo rotulo="Buscar por nome ou e-mail"><input value={busca} onChange={e => setBusca(e.target.value)} /></Campo>
      <Campo rotulo="Papel"><select value={papel} onChange={e => setPapel(e.target.value)}><option value="">Todos</option>{PAPEIS_INSTITUCIONAIS.map(p => <option key={p} value={p}>{PAPEL_LABEL[p]}</option>)}</select></Campo>
      <Campo rotulo="Situação"><select value={sit} onChange={e => setSit(e.target.value)}><option value="">Todas</option>{(['aprovado', 'bloqueado', 'revogado', 'recusado'] as const).map(s => <option key={s} value={s}>{SITUACAO_LABEL[s]}</option>)}</select></Campo>
    </div>
    <Erro texto={erro} />{!alvo && <Aviso msg={a.msg} />}
    {!pg.visiveis.length ? <p className="vazio">Nenhuma pessoa encontrada.</p> : <div className="tabela-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th>{gestor && <th>Ações</th>}</tr></thead>
      <tbody>{pg.visiveis.map(p => <tr key={p.usuarioId}><td>{p.nome}{p.convidadoPara && <div className="muted small">Convidado por link · só avalia: {p.convidadoPara}</div>}</td><td>{p.email}</td>
        <td>{gestor && p.situacao === 'aprovado' && p.usuarioId !== ctx!.usuarioId ? <select aria-label={`Papel de ${p.nome}`} value={p.papel} onChange={e => rodar(() => alterarPapel(ctx!, p.usuarioId, e.target.value as Papel, token), 'Papel alterado.')}>{PAPEIS_INSTITUCIONAIS.map(x => <option key={x} value={x}>{PAPEL_LABEL[x]}</option>)}</select> : PAPEL_LABEL[p.papel]}</td>
        <td><Tag valor={p.situacao} rotulo={SITUACAO_LABEL[p.situacao]} />{p.justificativa && <div className="muted small">{p.justificativa}</div>}</td>
        {gestor && <td className="td-acoes">{p.usuarioId === ctx!.usuarioId ? <span className="muted small">você</span> : p.situacao === 'aprovado'
          ? <div className="linha-acoes"><button className="ghost pequeno" onClick={() => { setAlvo({ p, acao: 'bloqueado' }); setMotivo(''); a.limpar() }}>Bloquear</button><button className="perigo pequeno" onClick={() => { setAlvo({ p, acao: 'revogado' }); setMotivo(''); a.limpar() }}>Revogar</button></div>
          : p.situacao === 'recusado' ? <span className="muted small">—</span> : <button className="pequeno" onClick={() => rodar(() => alterarSituacao(ctx!, p.usuarioId, 'aprovado', '', token), 'Acesso restaurado.')}>Restaurar acesso</button>}</td>}</tr>)}</tbody></table></div>}
    <Pager {...pg} />
    {alvo && <section className="card detalhe" aria-live="polite"><h2>{alvo.acao === 'bloqueado' ? 'Bloquear' : 'Revogar'} acesso de {alvo.p.nome}</h2>
      <p className="muted">O efeito é imediato: na próxima ação da pessoa o servidor nega o acesso, mesmo que ela esteja logada.</p>
      <Campo rotulo="Justificativa (obrigatória, registrada na auditoria)"><input value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo><Aviso msg={a.msg} />
      <div className="acoes"><button className="perigo" onClick={() => rodar(() => alterarSituacao(ctx!, alvo.p.usuarioId, alvo.acao, motivo, token), 'Acesso alterado.')}>Confirmar</button><button className="ghost" onClick={() => setAlvo(undefined)}>Cancelar</button></div></section>}
  </>)
}
