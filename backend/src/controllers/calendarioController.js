const db = require("../config/firebase");
const dayjs = require("dayjs");

/**
 * GET /calendario/:ano/:mes
 * Retorna férias aprovadas + feriados do mês para o calendário de equipe
 */
exports.getCalendarioMes = async (req, res) => {
  try {
    const ano = parseInt(req.params.ano);
    const mes = parseInt(req.params.mes);

    if (!ano || !mes || mes < 1 || mes > 12) {
      return res.status(400).json({ error: "Ano e mês inválidos." });
    }

    const inicioMes = dayjs(`${ano}-${String(mes).padStart(2, "0")}-01`);
    const fimMes = inicioMes.endOf("month");
    const inicioStr = inicioMes.format("YYYY-MM-DD");
    const fimStr = fimMes.format("YYYY-MM-DD");

    // Feriados do mês
    const feriadosSnap = await db.collection("datas_especiais")
      .where("data", ">=", inicioStr)
      .where("data", "<=", fimStr)
      .get();

    const feriados = feriadosSnap.docs.map(doc => doc.data());

    // Férias aprovadas que se sobrepõem ao mês
    const feriasSnap = await db.collection("ferias")
      .where("status", "==", "aprovado")
      .get();

    // Filtra as que têm interseção com o mês
    const ferias = feriasSnap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(f => {
        const inicio = dayjs(f.dataInicio);
        const fim = dayjs(f.dataFim);
        return inicio.isBefore(fimMes.add(1, "day")) && fim.isAfter(inicioMes.subtract(1, "day"));
      });

    res.json({ feriados, ferias });
  } catch (error) {
    console.error("Erro ao buscar calendário:", error);
    res.status(500).json({ error: "Erro ao buscar dados do calendário." });
  }
};
