const db = require("../config/firebase");
const dayjs = require("dayjs");

const STATUS_VALIDOS = ["pendente", "aprovado", "reprovado"];

/**
 * Lista férias — admin/RH vê todas, leitor vê apenas as suas
 */
exports.listarFerias = async (req, res) => {
  try {
    const { role, email } = req.user;
    const isAdminOrRH = role === "admin" || role === "rh";

    let query = db.collection("ferias").orderBy("dataInicio", "desc");

    if (!isAdminOrRH) {
      const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();
      if (userSnap.empty) return res.status(403).json({ error: "Usuário não encontrado." });
      const discordId = userSnap.docs[0].data().discordId;
      if (!discordId) return res.json([]);
      query = db.collection("ferias").where("discordId", "==", discordId).orderBy("dataInicio", "desc");
    }

    const snap = await query.get();
    const ferias = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(ferias);
  } catch (error) {
    console.error("Erro ao listar férias:", error);
    res.status(500).json({ error: "Erro ao listar férias." });
  }
};

/**
 * Solicita férias (leitor) — cria com status pendente
 */
exports.solicitarFerias = async (req, res) => {
  try {
    const { email } = req.user;
    const { dataInicio, dataFim, observacao } = req.body;

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ error: "dataInicio e dataFim são obrigatórios." });
    }

    if (dayjs(dataFim).isBefore(dayjs(dataInicio))) {
      return res.status(400).json({ error: "dataFim deve ser igual ou posterior a dataInicio." });
    }

    const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();
    if (userSnap.empty) return res.status(403).json({ error: "Usuário não encontrado." });

    const userData = userSnap.docs[0].data();
    if (!userData.discordId) {
      return res.status(400).json({ error: "Usuário sem discordId configurado." });
    }

    // Verifica sobreposição com férias já aprovadas ou pendentes
    const sobrepostos = await db.collection("ferias")
      .where("discordId", "==", userData.discordId)
      .where("status", "in", ["pendente", "aprovado"])
      .get();

    for (const doc of sobrepostos.docs) {
      const f = doc.data();
      const novoInicio = dayjs(dataInicio);
      const novoFim = dayjs(dataFim);
      const existInicio = dayjs(f.dataInicio);
      const existFim = dayjs(f.dataFim);
      if (novoInicio.isBefore(existFim) && novoFim.isAfter(existInicio)) {
        return res.status(409).json({ error: "Período conflita com férias já existentes." });
      }
    }

    const ref = await db.collection("ferias").add({
      discordId: userData.discordId,
      usuario: userData.usuario || email.split("@")[0],
      email,
      dataInicio,
      dataFim,
      observacao: observacao?.trim() || null,
      status: "pendente",
      observacaoAdmin: null,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    });

    const io = req.app.get("io");
    io.emit("ferias-atualizadas");

    res.json({ success: true, id: ref.id, message: "Férias solicitadas com sucesso." });
  } catch (error) {
    console.error("Erro ao solicitar férias:", error);
    res.status(500).json({ error: "Erro ao solicitar férias." });
  }
};

/**
 * Altera status das férias — apenas admin/RH
 */
exports.atualizarStatusFerias = async (req, res) => {
  try {
    const { role } = req.user;
    if (role !== "admin" && role !== "rh") {
      return res.status(403).json({ error: "Acesso negado." });
    }

    const { id } = req.params;
    const { status, observacaoAdmin } = req.body;

    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ error: "Status inválido." });
    }

    const ref = db.collection("ferias").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Registro de férias não encontrado." });

    await ref.update({
      status,
      observacaoAdmin: observacaoAdmin?.trim() || null,
      atualizadoEm: new Date().toISOString(),
    });

    const io = req.app.get("io");
    io.emit("ferias-atualizadas");

    res.json({ success: true, message: `Férias ${status}.` });
  } catch (error) {
    console.error("Erro ao atualizar férias:", error);
    res.status(500).json({ error: "Erro ao atualizar férias." });
  }
};

/**
 * Remove solicitação — leitor remove a sua (somente pendente), admin remove qualquer
 */
exports.deletarFerias = async (req, res) => {
  try {
    const { role, email } = req.user;
    const { id } = req.params;

    const ref = db.collection("ferias").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Registro de férias não encontrado." });

    const ferias = snap.data();
    const isAdminOrRH = role === "admin" || role === "rh";

    if (!isAdminOrRH) {
      if (ferias.email !== email) return res.status(403).json({ error: "Acesso negado." });
      if (ferias.status !== "pendente") {
        return res.status(400).json({ error: "Só é possível cancelar férias com status pendente." });
      }
    }

    await ref.delete();

    const io = req.app.get("io");
    io.emit("ferias-atualizadas");

    res.json({ success: true, message: "Férias removidas." });
  } catch (error) {
    console.error("Erro ao deletar férias:", error);
    res.status(500).json({ error: "Erro ao deletar férias." });
  }
};

/**
 * Verifica se um discordId está em férias aprovadas em uma data específica
 * Usado internamente pelo resumeUtils para excluir dias de férias da meta
 */
exports.getDiasFerias = async (discordId, ano, mes) => {
  const prefixo = `${ano}-${String(mes).padStart(2, "0")}`;
  const inicioMes = dayjs(`${prefixo}-01`);
  const fimMes = inicioMes.endOf("month");

  const snap = await db.collection("ferias")
    .where("discordId", "==", discordId)
    .where("status", "==", "aprovado")
    .get();

  const diasFerias = new Set();

  for (const doc of snap.docs) {
    const { dataInicio, dataFim } = doc.data();
    let cursor = dayjs(dataInicio);
    const fim = dayjs(dataFim);

    while (cursor.isBefore(fim.add(1, "day"))) {
      if (cursor.isSameOrAfter(inicioMes) && cursor.isSameOrBefore(fimMes)) {
        diasFerias.add(cursor.format("YYYY-MM-DD"));
      }
      cursor = cursor.add(1, "day");
    }
  }

  return diasFerias;
};
