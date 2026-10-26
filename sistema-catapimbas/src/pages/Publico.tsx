import { useState } from 'react'
import Login from './Login'
import Cadastro from './Cadastro'
import Recuperar from './Recuperar'

export default function Publico() {
  const [tela, setTela] = useState<'login' | 'cadastro' | 'recuperar'>('login')
  if (tela === 'cadastro') return <Cadastro onVoltar={() => setTela('login')} />
  if (tela === 'recuperar') return <Recuperar onVoltar={() => setTela('login')} />
  return <Login onCadastro={() => setTela('cadastro')} onRecuperar={() => setTela('recuperar')} />
}
