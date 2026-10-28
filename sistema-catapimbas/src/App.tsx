import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { MENU, useAuth } from './auth'
import { instituicoes, nomeInstituicao } from './api'
import { PAPEL_LABEL } from './types'
import Publico from './pages/Publico'
import Plataforma from './pages/Plataforma'
import Pessoas from './pages/Pessoas'
import Bancas from './pages/Bancas'
import BancaDetalhe from './pages/BancaDetalhe'
import MinhasAvaliacoes from './pages/MinhasAvaliacoes'
import Auditoria from './pages/Auditoria'
import Perfil from './pages/Perfil'
import { ConviteRota } from './pages/Convite'
import Dashboard from './pages/Dashboard'
import Projetos from './pages/Projetos'
import Avaliar from './pages/Avaliar'
import Resultados from './pages/Resultados'
import Aprovacoes from './pages/Aprovacoes'
import Instituicoes from './pages/Instituicoes'

export default function App() {
  const { user, ctx, sair, trocarVinculo, vinculoIdx } = useAuth()
  const { pathname } = useLocation()
  const cor = ctx ? instituicoes.find(i => i.id === ctx.instituicaoId)?.cor : undefined
  useEffect(() => { document.documentElement.style.setProperty('--teal', cor ?? '#0e7c7b') }, [cor])
  if (!user || !ctx) return <Publico />
  const ativos = user.vinculos.filter(v => v.situacao === 'aprovado')
  const home = ctx.papel === 'avaliador' ? '/avaliar' : '/'
  const liberada = pathname === '/' || pathname.startsWith('/convite/') || MENU.some(m => m.papeis.includes(ctx.papel) && (pathname === m.to || pathname.startsWith(`${m.to}/`)))
  if (!liberada) return <Navigate to={home} replace />
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
          <Route path="/" element={ctx.papel === 'avaliador' ? <Navigate to="/avaliar" /> : ctx.papel === 'superadmin' ? <Plataforma /> : <Dashboard />} />
          <Route path="/projetos" element={<Projetos />} />
          <Route path="/avaliar" element={<Avaliar />} />
          <Route path="/resultados" element={<Resultados />} />
          <Route path="/aprovacoes" element={<Aprovacoes />} />
          <Route path="/instituicoes" element={<Instituicoes />} />
          <Route path="/pessoas" element={<Pessoas />} />
          <Route path="/bancas" element={<Bancas />} />
          <Route path="/bancas/:id" element={<BancaDetalhe />} />
          <Route path="/minhas-avaliacoes" element={<MinhasAvaliacoes />} />
          <Route path="/auditoria" element={<Auditoria />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/convite/:token" element={<ConviteRota />} />
          <Route path="*" element={<Navigate to={home} />} />
        </Routes>
      </main>
    </div>
  )
}
