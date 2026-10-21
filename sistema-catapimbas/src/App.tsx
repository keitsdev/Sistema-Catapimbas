import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { MENU, useAuth } from './auth'
import { nomeInstituicao } from './api'
import { PAPEL_LABEL } from './types'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Projetos from './pages/Projetos'
import Avaliar from './pages/Avaliar'
import Resultados from './pages/Resultados'
import Aprovacoes from './pages/Aprovacoes'
import Instituicoes from './pages/Instituicoes'

export default function App() {
  const { user, ctx, sair, trocarVinculo, vinculoIdx } = useAuth()
  if (!user || !ctx) return <Login />
  const ativos = user.vinculos.filter(v => v.situacao === 'aprovado')
  const home = ctx.papel === 'avaliador' ? '/avaliar' : '/'
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Banca Viva</div>
        <nav aria-label="Navegação principal">
          {MENU.filter(m => m.papeis.includes(ctx.papel)).map(m => <NavLink key={m.to} to={m.to} end={m.to === '/'}>{m.label}</NavLink>)}
        </nav>
        <div className="who">
          <strong>{user.nome}</strong>
          <span>{PAPEL_LABEL[ctx.papel]} · {nomeInstituicao(ctx.instituicaoId)}</span>
          {ativos.length > 1 && (
            <label>Instituição ativa
              <select value={vinculoIdx} onChange={e => trocarVinculo(Number(e.target.value))}>
                {ativos.map((v, i) => <option key={i} value={i}>{nomeInstituicao(v.instituicaoId)} ({PAPEL_LABEL[v.papel]})</option>)}
              </select>
            </label>)}
          <button className="ghost" onClick={sair}>Sair</button>
        </div>
      </aside>
      <main className="main" key={`${ctx.instituicaoId}-${ctx.papel}`}>
        <Routes>
          <Route path="/" element={ctx.papel === 'avaliador' ? <Navigate to="/avaliar" /> : <Dashboard />} />
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/avaliar" element={<Avaliar />} />
          <Route path="/resultados" element={<Resultados />} />
          <Route path="/aprovacoes" element={<Aprovacoes />} />
          <Route path="/instituicoes" element={<Instituicoes />} />
          <Route path="*" element={<Navigate to={home} />} />
        </Routes>
      </main>
    </div>
  )
}
