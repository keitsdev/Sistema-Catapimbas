import { useState } from 'react'
import Login from './Login'
import Cadastro from './Cadastro'
import Recuperar from './Recuperar'
import Convite from './Convite'

export default function Publico() {
  const [tela, setTela] = useState<'login' | 'cadastro' | 'recuperar'>('login')
  const convite = new URLSearchParams(window.location.search).get('convite') || window.location.pathname.match(/^\/convite\/([A-Za-z0-9_-]+)/)?.[1]
  if (convite) return <Convite token={convite} />
  if (tela === 'cadastro') return <Cadastro onVoltar={() => setTela('login')} />
  if (tela === 'recuperar') return <Recuperar onVoltar={() => setTela('login')} />
  return <Login onCadastro={() => setTela('cadastro')} onRecuperar={() => setTela('recuperar')} />
}
