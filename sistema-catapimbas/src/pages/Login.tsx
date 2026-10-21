import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'

export default function Login() {
  const { entrar } = useAuth()
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(''); const [load, setLoad] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(''); setLoad(true)
    try { await entrar(email, senha) } catch (x) { setErro((x as Error).message) } finally { setLoad(false) }
  }
  return (
    <div className="login">
      <section className="login-hero">
        <h1>Cada startup, uma nota justa.</h1>
        <p>Cadastre projetos, monte bancas, registre avaliações por critério e publique o ranking da sua instituição com rastreabilidade.</p>
        <div className="mini-podium" aria-hidden="true"><i style={{ height: 70 }}>2</i><i style={{ height: 110 }}>1</i><i style={{ height: 48 }}>3</i></div>
      </section>
      <form className="card login-form" onSubmit={enviar}>
        <h2>Entrar</h2>
        <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
        <label>Senha<input type="password" required value={senha} onChange={e => setSenha(e.target.value)} autoComplete="current-password" /></label>
        {erro && <p role="alert" className="erro">{erro}</p>}
        <button disabled={load}>{load ? 'Entrando…' : 'Entrar'}</button>
        <p className="muted small">Ainda sem conta? Peça ingresso à sua instituição. A recuperação de senha enviará um link ao seu e-mail (a conectar à API).</p>
        <details className="small"><summary>Contas de demonstração (senha demo1234)</summary>
          admin@demo.dev · andre@demo.dev (avaliador + orientador em 2 instituições) · coord@demo.dev · aluno@demo.dev · super@demo.dev</details>
      </form>
    </div>
  )
}
