import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from './api'
import type { Contexto, Papel, Usuario } from './types'

interface Auth { user: Usuario | null; ctx: Contexto | null; entrar(e: string, s: string): Promise<void>; sair(): void; trocarVinculo(i: number): void; vinculoIdx: number; aviso: string }
const C = createContext<Auth>(null!)
export const useAuth = () => useContext(C)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null)
  const [vinculoIdx, setIdx] = useState(0)
  const [aviso, setAviso] = useState('')
  useEffect(() => { api.aoPerderAcesso(() => { setUser(null); setAviso('Seu acesso foi alterado por um administrador. Entre novamente.') }); return () => api.aoPerderAcesso(() => {}) }, [])
  const value = useMemo<Auth>(() => {
    const ativos = user?.vinculos.filter(v => v.situacao === 'aprovado') ?? []
    const v = ativos[vinculoIdx] ?? ativos[0]
    return {
      user, vinculoIdx, aviso,
      ctx: user && v ? { usuarioId: user.id, instituicaoId: v.instituicaoId, papel: v.papel } : null,
      async entrar(e, s) { setAviso(''); setUser(await api.login(e, s)); setIdx(0) },
      sair() { setAviso(''); setUser(null) },
      trocarVinculo: setIdx,
    }
  }, [user, vinculoIdx, aviso])
  return <C.Provider value={value}>{children}</C.Provider>
}
export const MENU: { to: string; label: string; papeis: Papel[] }[] = [
  { to: '/', label: 'Painel', papeis: ['admin', 'coordenador', 'orientador', 'aluno', 'superadmin'] },
  { to: '/projetos', label: 'Projetos', papeis: ['admin', 'coordenador', 'orientador', 'aluno'] },
  { to: '/bancas', label: 'Bancas', papeis: ['admin', 'coordenador'] },
  { to: '/avaliar', label: 'Avaliar', papeis: ['avaliador'] },
  { to: '/minhas-avaliacoes', label: 'Minhas avaliações', papeis: ['avaliador'] },
  { to: '/resultados', label: 'Resultados', papeis: ['admin', 'coordenador', 'orientador', 'avaliador', 'aluno'] },
  { to: '/aprovacoes', label: 'Aprovações', papeis: ['admin'] },
  { to: '/pessoas', label: 'Pessoas', papeis: ['admin', 'coordenador'] },
  { to: '/instituicoes', label: 'Instituições', papeis: ['superadmin'] },
  { to: '/auditoria', label: 'Auditoria', papeis: ['admin', 'superadmin'] },
  { to: '/perfil', label: 'Meu perfil', papeis: ['admin', 'coordenador', 'orientador', 'avaliador', 'aluno', 'superadmin'] },
]
