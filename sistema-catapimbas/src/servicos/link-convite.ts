export function criarUrlConvite(origem: string, baseUrl: string, token: string): string {
  const url = new URL(baseUrl, origem)
  url.searchParams.set('convite', token)
  return url.toString()
}
