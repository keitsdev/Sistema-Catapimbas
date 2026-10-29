import { useEffect, useState } from 'react'
import { decidirSolicitacao, listarSolicitacoes } from '../servicos/acesso'
import { useAuth } from '../auth'
import { PAPEL_LABEL } from '../types'

type S = Awaited<ReturnType<typeof listarSolicitacoes>>
export default function Aprovacoes() {
  const { ctx, token } = useAuth(); const [lista, setLista] = useState<S>([]); const [just, setJust] = useState<Record<number, string>>({}); const [erro, setErro] = useState('')
  const carregar = () => listarSolicitacoes(ctx!, token).then(setLista).catch(e => setErro((e as Error).message))
  useEffect(() => { carregar() }, [ctx, token])
  const decidir = async (id: number, ok: boolean) => { try { setErro(''); await decidirSolicitacao(ctx!, id, ok, just[id], undefined, token); await carregar() } catch (e) { setErro((e as Error).message) } }
  const pend = lista.filter(s => s.situacao === 'pendente')
  return (
    <>
      <h1>Aprovações</h1>
      {erro && <p role="alert" className="erro">{erro}</p>}
      {!pend.length ? <p className="vazio">Nenhuma solicitação pendente.</p> : pend.map(s => (
        <div className="card pedido" key={s.id}>
          <div><b>{s.nome}</b><br /><span className="muted">{s.email} · quer entrar como {PAPEL_LABEL[s.papel]}</span></div>
          <input placeholder="Justificativa (obrigatória para recusar)" aria-label={`Justificativa para ${s.nome}`} value={just[s.id] ?? ''} onChange={e => setJust({ ...just, [s.id]: e.target.value })} />
          <div className="acoes"><button onClick={() => decidir(s.id, true)}>Aprovar</button><button className="ghost" onClick={() => decidir(s.id, false)}>Recusar</button></div>
        </div>))}
    </>
  )
}
