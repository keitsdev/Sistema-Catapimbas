import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as api from './api'
import type { Contexto, Instituicao, Papel, Usuario } from './types'
import { entrarPelaApi } from './servicos/auth-api'

interface Auth {
  user: Usuario | null
  ctx: Contexto | null
  token: string | null
  instituicoes: Instituicao[]
  modoApi: boolean
  entrar(e: string, s: string): Promise<void>
  sair(): void
  trocarVinculo(i: number): void
  vinculoIdx: number
  aviso: string
}
const C = createContext<Auth>(null!)
export const useAuth = () => useContext(C)
// Dados remotos precisam de um token Auth real; não combine CRUD de API com login mock.
const modoApi = import.meta.env.VITE_AUTH_MODE === 'api' || import.meta.env.VITE_DATA_MODE === 'api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [instituicoes, setInstituicoes] = useState<Instituicao[]>([])
  const [vinculoIdx, setIdx] = useState(0)
  const [aviso, setAviso] = useState('')
  useEffect(() => {
    api.aoPerderAcesso(() => {
      setUser(null); setToken(null); setInstituicoes([])
      setAviso('Seu acesso foi alterado por um administrador. Entre novamente.')
    })
    return () => api.aoPerderAcesso(() => {})
  }, [])

  const value = useMemo<Auth>(() => {
    const ativos = user?.vinculos.filter(v => v.situacao === 'aprovado') ?? []
    const v = ativos[vinculoIdx] ?? ativos[0]
    return {
      user, token, instituicoes, modoApi, vinculoIdx, aviso,
      ctx: user && v ? { usuarioId: user.id, instituicaoId: v.instituicaoId, papel: v.papel } : null,
      async entrar(e, s) {
        setAviso('')
        if (modoApi) {
          const resposta = await entrarPelaApi(e, s)
          setUser(resposta.user)
          setToken(resposta.session.accessToken)
          setInstituicoes(resposta.instituicoes)
        } else {
          setUser(await api.login(e, s))
          setToken(null)
          setInstituicoes([])
        }
        setIdx(0)
      },
      sair() { setAviso(''); setUser(null); setToken(null); setInstituicoes([]); setIdx(0) },
      trocarVinculo: setIdx,
    }
  }, [user, token, instituicoes, vinculoIdx, aviso])
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
