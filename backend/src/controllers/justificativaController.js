const db = require("../config/firebase");
const { extrairMinutosDeString, formatarMinutosParaHoras } = require("../utils/timeUtils");
const { enviarEmailNotificacao, enviarEmailConfirmacaoLeitor } = require("../utils/emailHelper");

/**
 * Tipos válidos de justificativa:
 * - abono_parcial: abona a diferença entre meta e horas trabalhadas
 * - abono_dia: abona o dia inteiro (meta completa do usuário)
 * - horas_extras: registra o excedente positivo no banco
 * - informativo: sem impacto no saldo
 */
const TIPOS_VALIDOS = ["abono_parcial", "abono_dia", "horas_extras", "informativo"];

async function getUserRole(email) {
  const snapshot = await db.collection("users").where("email", "==", email).get();
  if (snapshot.empty) return "leitor";
  return snapshot.docs[0].data().role || "leitor";
}

async function getMetaHorasDia(discordId, data) {
  const prefixoData = data.slice(0, 7); // "YYYY-MM"
  try {
    const userSnapshot = await db.collection("users").where("discordId", "==", discordId).limit(1).get();
    if (userSnapshot.empty) return 8;
    const metasDoc = await userSnapshot.docs[0].ref.collection("metas").doc(prefixoData).get();
    if (metasDoc.exists && metasDoc.data().metaHorasDia) {
      return metasDoc.data().metaHorasDia;
    }
  } catch (err) {
    console.warn("⚠️ Erro ao buscar meta personalizada:", err.message);
  }
  return 8;
}

function calcularAbonoMinutos(tipo, minutosTrabalhados, jornadaBase) {
  if (tipo === "abono_parcial") return Math.max(0, jornadaBase - minutosTrabalhados);
  if (tipo === "abono_dia") return jornadaBase;
  if (tipo === "horas_extras") return Math.max(0, minutosTrabalhados - jornadaBase);
  return 0; // informativo
}

exports.deleteJustificativa = async (req, res) => {
  try {
    const { usuario, data } = req.body;
    const email = req.user.email;

    const registroId = `${usuario}_${data}`;
    const registroRef = db.collection("registros").doc(registroId);
    const doc = await registroRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Registro não encontrado." });
    }

    const snapshot = await db.collection("users").where("email", "==", email).get();
    if (snapshot.empty) return res.status(403).json({ error: "Usuário não encontrado." });

    const userData = snapshot.docs[0].data();
    const userRole = userData.role || "leitor";
    const userDiscordId = userData.discordId;

    const isAdminOrRH = userRole === "admin" || userRole === "rh";
    if (!isAdminOrRH && (!userDiscordId || doc.data().discordId !== userDiscordId)) {
      return res.status(403).json({ error: "Você não tem permissão para deletar esta justificativa." });
    }

    await registroRef.set({ justificativa: null }, { merge: true });

    const io = req.app.get("io");
    io.emit("registro-atualizado", { usuario, data });

    return res.json({ success: true, message: "Justificativa deletada com sucesso." });
  } catch (error) {
    console.error("Erro ao deletar justificativa:", error);
    return res.status(500).json({ error: "Erro ao deletar justificativa." });
  }
};

exports.upsertJustificativa = async (req, res) => {
  try {
    const { usuario, data, text, tipo, status, file, fileName, observacaoAdmin } = req.body;

    const email = req.user.email;
    const userRole = await getUserRole(email);
    const isAdminOrRH = userRole === "admin" || userRole === "rh";
    const justificativaStatus = isAdminOrRH && status ? status : "pendente";

    const registroId = `${usuario}_${data}`;
    const registroRef = db.collection("registros").doc(registroId);
    const doc = await registroRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Registro não encontrado para esse usuário e data." });
    }

    const registroAtual = doc.data();
    const justificativaAntiga = registroAtual.justificativa || {};

    // Preserva tipo existente se não vier um novo válido
    const tipoDefinitivo = (TIPOS_VALIDOS.includes(tipo) ? tipo : null) ?? justificativaAntiga.tipo ?? null;

    // abonoHoras é calculado automaticamente na aprovação, não preenchido manualmente
    let abonoHoras = justificativaAntiga.abonoHoras ?? null;

    if (justificativaStatus === "aprovado" && tipoDefinitivo && tipoDefinitivo !== "informativo") {
      const metaHorasDia = await getMetaHorasDia(registroAtual.discordId, data);
      const jornadaBase = metaHorasDia * 60;
      const minutosTrabalhados = extrairMinutosDeString(registroAtual.total_horas || "0h 0m");
      const abonoMinutos = calcularAbonoMinutos(tipoDefinitivo, minutosTrabalhados, jornadaBase);
      abonoHoras = abonoMinutos > 0 ? formatarMinutosParaHoras(abonoMinutos) : null;
    }

    // Na reprovação, limpa qualquer abono anterior
    if (justificativaStatus === "reprovado") {
      abonoHoras = null;
    }

    const justificativa = {
      text,
      tipo: tipoDefinitivo,
      status: justificativaStatus,
      abonoHoras,
      updatedAt: new Date().toISOString(),
      file: file ?? justificativaAntiga.file ?? null,
      fileName: fileName ?? justificativaAntiga.fileName ?? null,
      observacaoAdmin: observacaoAdmin?.trim() ?? justificativaAntiga.observacaoAdmin ?? null,
    };

    await registroRef.set({ justificativa }, { merge: true });

    if (justificativaStatus === "pendente") await enviarEmailNotificacao(justificativa, usuario, data);
    if (["aprovado", "reprovado"].includes(justificativaStatus)) await enviarEmailConfirmacaoLeitor(justificativa, usuario, data, justificativaStatus);

    const io = req.app.get("io");
    io.emit("registro-atualizado", { usuario, data });

    return res.json({ success: true, message: "Justificativa registrada/atualizada com sucesso." });
  } catch (error) {
    console.error("Erro ao registrar justificativa:", error);
    return res.status(500).json({ error: "Erro ao registrar justificativa." });
  }
};
