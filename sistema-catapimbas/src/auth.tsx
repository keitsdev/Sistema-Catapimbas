import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import * as api from './api'
import type { Contexto, Papel, Usuario } from './types'

interface Auth { user: Usuario | null; ctx: Contexto | null; entrar(e: string, s: string): Promise<void>; sair(): void; trocarVinculo(i: number): void; vinculoIdx: number }
const C = createContext<Auth>(null!)
export const useAuth = () => useContext(C)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null)
  const [vinculoIdx, setIdx] = useState(0)
  const value = useMemo<Auth>(() => {
    const ativos = user?.vinculos.filter(v => v.situacao === 'aprovado') ?? []
    const v = ativos[vinculoIdx] ?? ativos[0]
    return {
      user, vinculoIdx,
      ctx: user && v ? { usuarioId: user.id, instituicaoId: v.instituicaoId, papel: v.papel } : null,
      async entrar(e, s) { setUser(await api.login(e, s)); setIdx(0) },
      sair() { setUser(null) }, // com backend: POST /auth/logout
      trocarVinculo: setIdx,
    }
  }, [user, vinculoIdx])
  return <C.Provider value={value}>{children}</C.Provider>
}
/** Apenas conveniência de UI: a permissão de verdade é checada no servidor a cada chamada. */
export const MENU: { to: string; label: string; papeis: Papel[] }[] = [
  { to: '/', label: 'Painel', papeis: ['admin', 'coordenador', 'orientador', 'aluno', 'superadmin'] },
  { to: '/projetos', label: 'Projetos', papeis: ['admin', 'coordenador', 'orientador', 'aluno'] },
  { to: '/avaliar', label: 'Avaliar', papeis: ['avaliador'] },
  { to: '/resultados', label: 'Resultados', papeis: ['admin', 'coordenador', 'orientador', 'avaliador', 'aluno'] },
  { to: '/aprovacoes', label: 'Aprovações', papeis: ['admin'] },
  { to: '/instituicoes', label: 'Instituições', papeis: ['superadmin'] },
]
