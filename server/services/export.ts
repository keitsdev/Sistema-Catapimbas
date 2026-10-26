import ExcelJS from 'exceljs';
import { supabase } from '../../src/lib/supabase';
import { HttpError } from '../../src//lib/http-error';

export async function gerarExcelResultados(bancaId: string, institutionId: string): Promise<Buffer> {
  const { data: banca } = await supabase
    .from('bancas')
    .select('nome, instituicao_id')
    .eq('id', bancaId)
    .eq('instituicao_id', institutionId)
    .maybeSingle();

  if (!banca) {
    throw new HttpError(403, 'Acesso negado ou banca inexistente.');
  }

  const { data: registros } = await supabase
    .from('avaliacoes')
    .select(`
      nota,
      status,
      created_at,
      projetos ( nome ),
      usuarios ( nome ),
      criterios ( titulo, peso )
    `)
    .eq('banca_id', bancaId)
    .eq('status', 'valida');

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Resultados');

  worksheet.columns = [
    { header: 'Projeto', key: 'projeto', width: 30 },
    { header: 'Avaliador', key: 'avaliador', width: 25 },
    { header: 'Critério', key: 'criterio', width: 25 },
    { header: 'Peso', key: 'peso', width: 10 },
    { header: 'Nota Lançada', key: 'nota', width: 15 },
    { header: 'Data/Hora', key: 'data', width: 20 }
  ];

  registros?.forEach((row: any) => {
    worksheet.addRow({
      projeto: row.projetos?.nome,
      avaliador: row.usuarios?.nome,
      criterio: row.criterios?.titulo,
      peso: row.criterios?.peso,
      nota: row.nota,
      data: new Date(row.created_at).toLocaleString('pt-BR')
    });
  });

  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '1F2937' }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export { exportProjects, exportRanking } from "./export.contract.js";
