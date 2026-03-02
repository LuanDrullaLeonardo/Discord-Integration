const db = require('../config/firebase');
const { extrairMinutosDeString, formatarMinutosParaHoras } = require('../utils/timeUtils');
const dayjs = require('dayjs');

/**
 * Persiste o banco de horas de um mês para o histórico
 * @param {string} discordId - Discord ID do usuário
 * @param {number} ano - Ano
 * @param {number} mes - Mês (1-12)
 * @param {number} saldoMinutos - Saldo em minutos
 * @returns {Promise<void>}
 */
exports.persistirBancoMensal = async (discordId, ano, mes, saldoMinutos) => {
  try {
    const mesAnoKey = `${ano}-${String(mes).padStart(2, '0')}`;
    
    const bancoRef = db.collection('banco_horas')
      .doc(discordId)
      .collection('historico')
      .doc(mesAnoKey);

    await bancoRef.set({
      ano,
      mes,
      mesAno: mesAnoKey,
      saldoMinutos,
      saldoFormatado: formatarMinutosParaHoras(saldoMinutos),
      fechadoEm: new Date().toISOString(),
      discordId
    });

    console.log(`✅ Banco de horas persistido: ${discordId} - ${mesAnoKey}: ${formatarMinutosParaHoras(saldoMinutos)}`);
  } catch (error) {
    console.error('❌ Erro ao persistir banco de horas:', error.message);
    throw error;
  }
};

/**
 * Busca o histórico de banco de horas (últimos 6 meses)
 * @param {string} discordId - Discord ID do usuário
 * @param {number} limiteMeses - Quantidade de meses (padrão 6)
 * @returns {Promise<Array>} Array com histórico
 */
exports.buscarHistoricoBanco = async (discordId, limiteMeses = 6) => {
  try {
    const snapshot = await db.collection('banco_horas')
      .doc(discordId)
      .collection('historico')
      .orderBy('mesAno', 'desc')
      .limit(limiteMeses)
      .get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error('❌ Erro ao buscar histórico de banco:', error.message);
    return [];
  }
};

/**
 * Calcula o banco de horas acumulado até um mês específico
 * @param {string} discordId - Discord ID do usuário
 * @param {number} ano - Ano
 * @param {number} mes - Mês (1-12)
 * @returns {Promise<number>} Saldo acumulado em minutos
 */
exports.calcularBancoAcumulado = async (discordId, ano, mes) => {
  try {
    const mesAnoAtual = `${ano}-${String(mes).padStart(2, '0')}`;
    
    // Busca todos os registros até o mês atual (inclusive)
    // O doc do mês atual é salvo com o mês seguinte como chave (fechamento no dia 01),
    // então <= inclui corretamente o último fechamento disponível
    const snapshot = await db.collection('banco_horas')
      .doc(discordId)
      .collection('historico')
      .where('mesAno', '<=', mesAnoAtual)
      .orderBy('mesAno', 'asc')
      .get();

    if (snapshot.empty) {
      return 0;
    }

    // Soma apenas os últimos 6 meses anteriores
    const historico = snapshot.docs
      .map(doc => doc.data())
      .slice(-6);

    const totalAcumulado = historico.reduce((acc, item) => {
      return acc + (item.saldoMinutos || 0);
    }, 0);

    return totalAcumulado;
  } catch (error) {
    console.error('❌ Erro ao calcular banco acumulado:', error.message);
    return 0;
  }
};

/**
 * Busca o saldo do mês anterior
 * @param {string} discordId - Discord ID do usuário
 * @param {number} ano - Ano atual
 * @param {number} mes - Mês atual (1-12)
 * @returns {Promise<number>} Saldo do mês anterior em minutos
 */
exports.buscarSaldoMesAnterior = async (discordId, ano, mes) => {
  try {
    // Calcula o mês anterior
    const dataAtual = dayjs(`${ano}-${String(mes).padStart(2, '0')}-01`);
    const mesAnterior = dataAtual.subtract(1, 'month');
    const mesAnoAnterior = mesAnterior.format('YYYY-MM');

    const bancoRef = await db.collection('banco_horas')
      .doc(discordId)
      .collection('historico')
      .doc(mesAnoAnterior)
      .get();

    if (!bancoRef.exists) {
      return 0;
    }

    return bancoRef.data().saldoMinutos || 0;
  } catch (error) {
    console.error('❌ Erro ao buscar saldo do mês anterior:', error.message);
    return 0;
  }
};

/**
 * Limpa histórico antigo (mantém apenas últimos 6 meses)
 * @param {string} discordId - Discord ID do usuário
 * @returns {Promise<void>}
 */
exports.limparHistoricoAntigo = async (discordId) => {
  try {
    const seisMesesAtras = dayjs().subtract(6, 'month').format('YYYY-MM');
    
    const snapshot = await db.collection('banco_horas')
      .doc(discordId)
      .collection('historico')
      .where('mesAno', '<', seisMesesAtras)
      .get();

    if (snapshot.empty) {
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`🗑️ Histórico antigo limpo para ${discordId}: ${snapshot.size} registros removidos`);
  } catch (error) {
    console.error('❌ Erro ao limpar histórico antigo:', error.message);
  }
};

/**
 * Fecha o mês atual e persiste o banco de horas
 * (Deve ser executado no dia 01 do mês seguinte)
 * O doc é salvo com a chave do mês atual (ex: fechamento em 01/03 salva como 2026-03)
 * @param {string} discordId - Discord ID do usuário
 * @param {Object} resumoMensal - Resumo mensal calculado
 * @returns {Promise<void>}
 */
exports.fecharMes = async (discordId, resumoMensal) => {
  try {
    // Usa o mês atual do dia em que o script roda (dia 01 do mês seguinte)
    const ano = dayjs().year();
    const mes = dayjs().month() + 1;

    // Pega o saldo atual do mês
    const saldoAtualMinutos = extrairMinutosDeString(resumoMensal.saldo);

    // Pega o banco acumulado anterior
    const bancoAnterior = await exports.calcularBancoAcumulado(discordId, ano, mes);

    // Calcula o novo saldo total
    const novoSaldoTotal = bancoAnterior + saldoAtualMinutos;

    // Persiste
    await exports.persistirBancoMensal(discordId, ano, mes, saldoAtualMinutos);

    // Limpa histórico antigo
    await exports.limparHistoricoAntigo(discordId);

    return {
      mesAtual: saldoAtualMinutos,
      bancoAnterior,
      saldoTotal: novoSaldoTotal
    };
  } catch (error) {
    console.error('❌ Erro ao fechar mês:', error.message);
    throw error;
  }
};

