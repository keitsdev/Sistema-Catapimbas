import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dashboard } from '../api'
import { useAuth } from '../auth'

type D = Awaited<ReturnType<typeof dashboard>>
export default function Dashboard() {
  const { ctx } = useAuth(); const [d, setD] = useState<D>()
  useEffect(() => { dashboard(ctx!).then(setD) }, [ctx])
  if (!d) return <p>Carregando…</p>
  const kpi: [string, number | string][] = [['Projetos', d.projetos], ['Bancas', d.bancas], ['Avaliações concluídas', `${d.feitas} de ${d.esperadas}`]]
  return (
    <>
      <h1>Painel</h1>
      <div className="kpis">{kpi.map(([l, v]) => <div className="kpi" key={l}><b>{v}</b><span>{l}</span></div>)}</div>
      {d.projetos === 0 ? <p className="vazio">Nenhum projeto ainda. Cadastre o primeiro em Projetos.</p> : (
        <div className="grid2">
          {[['Projetos por situação', d.porStatus], ['Projetos por período', d.porPeriodo]].map(([t, data]) => (
            <section className="card" key={t as string}><h2>{t as string}</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data as { nome: string; total: number }[]}><CartesianGrid vertical={false} stroke="#d9e0e3" />
                  <XAxis dataKey="nome" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="total" fill="#0e7c7b" radius={[4, 4, 0, 0]} /></BarChart>
              </ResponsiveContainer></section>))}
        </div>)}
    </>
  )
}
