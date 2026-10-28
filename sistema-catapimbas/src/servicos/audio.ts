export const AUDIO_MAX_BYTES = 20 * 1024 * 1024
export const AUDIO_ACCEPT = '.mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg'
const EXTENSOES = ['mp3', 'wav', 'ogg']
const MIMES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'application/ogg', '']

export function validarMetadadosAudio(f: { name: string; type: string; size: number }): string | null {
  const ext = f.name.toLowerCase().split('.').pop() ?? ''
  if (!EXTENSOES.includes(ext) || !MIMES.includes(f.type.toLowerCase())) return 'Formato não aceito. Envie um arquivo MP3, WAV ou OGG.'
  if (f.size === 0) return 'O arquivo está vazio.'
  if (f.size > AUDIO_MAX_BYTES) return `O arquivo é grande demais (${(f.size / 1048576).toFixed(1)} MB). O limite é 20 MB.`
  return null
}

export function assinaturaAudio(b: Uint8Array): 'mp3' | 'wav' | 'ogg' | null {
  const t = (i: number, s: string) => s.split('').every((c, k) => b[i + k] === c.charCodeAt(0))
  if (t(0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3'
  if (t(0, 'RIFF') && t(8, 'WAVE')) return 'wav'
  if (t(0, 'OggS')) return 'ogg'
  return null
}

export async function prepararArquivoAudio(file: File): Promise<{ url: string; nome: string }> {
  const erro = validarMetadadosAudio(file)
  if (erro) throw new Error(erro)
  if (!assinaturaAudio(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) throw new Error('O conteúdo do arquivo não é um áudio MP3, WAV ou OGG válido.')
  const url = URL.createObjectURL(file)
  try {
    await new Promise<void>((ok, falha) => {
      const a = new Audio(); const t = window.setTimeout(() => falha(new Error('timeout')), 8000)
      a.onloadedmetadata = () => { clearTimeout(t); ok() }
      a.onerror = () => { clearTimeout(t); falha(new Error('erro')) }
      a.src = url
    })
  } catch { URL.revokeObjectURL(url); throw new Error('Não foi possível ler este áudio. O arquivo pode estar corrompido ou em formato não suportado pelo navegador.') }
  return { url, nome: file.name }
}
