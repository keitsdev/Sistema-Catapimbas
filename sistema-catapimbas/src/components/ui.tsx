import { useCallback, useEffect, useState, type DependencyList, type ReactNode } from 'react'

export function useCarregar<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [dados, setDados] = useState<T>(); const [erro, setErro] = useState(''); const [n, setN] = useState(0)
  useEffect(() => { let vivo = true; setErro(''); fn().then(d => vivo && setDados(d)).catch(e => vivo && setErro((e as Error).message)); return () => { vivo = false } },
    [...deps, n])
  return { dados, erro, recarregar: useCallback(() => setN(x => x + 1), []) }
}

export function useAcao() {
  const [msg, setMsg] = useState<{ ok: boolean; t: string }>(); const [ocupado, setOcupado] = useState(false)
  async function executar(fn: () => Promise<unknown>, okMsg = 'Salvo com sucesso.') {
    setMsg(undefined); setOcupado(true)
    try { await fn(); setMsg({ ok: true, t: okMsg }); return true } catch (e) { setMsg({ ok: false, t: (e as Error).message }); return false } finally { setOcupado(false) }
  }
  return { msg, ocupado, executar, limpar: () => setMsg(undefined) }
}
export const Aviso = ({ msg }: { msg?: { ok: boolean; t: string } }) => msg ? <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'erro'}>{msg.t}</p> : null
export const Erro = ({ texto }: { texto?: string }) => texto ? <p role="alert" className="erro">{texto}</p> : null
export const Campo = ({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) => <label>{rotulo}{children}{dica && <span className="muted small">{dica}</span>}</label>

export function Abas({ abas, atual, onChange }: { abas: [string, string][]; atual: string; onChange(id: string): void }) {
  return <div className="abas" role="tablist">{abas.map(([id, rot]) => <button key={id} role="tab" aria-selected={atual === id} className={atual === id ? 'aba on' : 'aba'} onClick={() => onChange(id)}>{rot}</button>)}</div>
}
export const Tag = ({ valor, rotulo }: { valor: string; rotulo?: string }) => <span className={`tag ${valor}`}>{rotulo ?? valor}</span>

export function usePagina<T>(itens: T[], porPagina = 8) {
  const [pag, setPag] = useState(1); const paginas = Math.max(1, Math.ceil(itens.length / porPagina))
  useEffect(() => { if (pag > paginas) setPag(paginas) }, [paginas, pag])
  return { visiveis: itens.slice((pag - 1) * porPagina, pag * porPagina), pag, paginas, setPag }
}
export const Pager = ({ pag, paginas, setPag }: { pag: number; paginas: number; setPag(n: number): void }) => paginas > 1 ? (
  <div className="pager"><button className="ghost" disabled={pag <= 1} onClick={() => setPag(pag - 1)}>Anterior</button><span>Página {pag} de {paginas}</span><button className="ghost" disabled={pag >= paginas} onClick={() => setPag(pag + 1)}>Próxima</button></div>) : null

export async function baixarXlsx(nome: string, aba: string, colunas: { header: string; key: string; width: number }[], linhas: Record<string, unknown>[]) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(aba); ws.columns = colunas; linhas.forEach(l => ws.addRow(l)); ws.getRow(1).font = { bold: true }
  const url = URL.createObjectURL(new Blob([(await wb.xlsx.writeBuffer()) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  Object.assign(document.createElement('a'), { href: url, download: nome }).click(); URL.revokeObjectURL(url)
}
export const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR')
