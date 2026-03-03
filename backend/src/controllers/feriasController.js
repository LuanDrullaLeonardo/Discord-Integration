const db = require("../config/firebase");
const dayjs = require("dayjs");
const nodemailer = require("nodemailer");

async function enviarEmailSolicitacaoFerias(usuario, dataInicio, dataFim) {
  try {
    const [adminsSnap, rhSnap] = await Promise.all([
      db.collection("users").where("role", "==", "admin").where("receberNotificacoes", "==", true).get(),
      db.collection("users").where("role", "==", "rh").where("receberNotificacoes", "==", true).get(),
    ]);

    const emails = [
      ...adminsSnap.docs.map(d => d.data().email),
      ...rhSnap.docs.map(d => d.data().email),
    ].filter(Boolean);

    if (emails.length === 0) return;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_SISTEMA, pass: process.env.EMAIL_SENHA },
    });

    await transporter.sendMail({
      from: `"Pontobot" <${process.env.EMAIL_SISTEMA}>`,
      to: emails.join(","),
      subject: `🌴 Solicitação de férias — ${usuario}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
          <h2 style="color: #5a40b6;">🌴 Nova Solicitação de Férias</h2>
          <p><strong>Colaborador:</strong> ${usuario}</p>
          <p><strong>Período:</strong> ${dayjs(dataInicio).format("DD/MM/YYYY")} até ${dayjs(dataFim).format("DD/MM/YYYY")}</p>
          <p><strong>Dias:</strong> ${dayjs(dataFim).diff(dayjs(dataInicio), "day") + 1} dias corridos</p>
          <p style="margin-top: 20px;">
            <a href="https://goepik-ponto.vercel.app/vacations" target="_blank"
              style="display:inline-block;padding:10px 20px;background-color:#5a40b6;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
              ➡️ Revisar solicitação
            </a>
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.warn("⚠️ Erro ao enviar email de férias:", err.message);
  }
}

async function enviarEmailConfirmacaoFerias(emailDestinatario, usuario, dataInicio, dataFim, status, observacaoAdmin) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_SISTEMA, pass: process.env.EMAIL_SENHA },
    });

    const aprovado = status === "aprovado";
    const cor = aprovado ? "#28a745" : "#dc3545";
    const icone = aprovado ? "✅" : "❌";
    const label = aprovado ? "APROVADAS" : "REPROVADAS";

    await transporter.sendMail({
      from: `"Pontobot" <${process.env.EMAIL_SISTEMA}>`,
      to: emailDestinatario,
      subject: `${icone} Suas férias foram ${label}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: ${cor};">${icone} Férias <strong>${label}</strong></h2>
          <p><strong>Período:</strong> ${dayjs(dataInicio).format("DD/MM/YYYY")} até ${dayjs(dataFim).format("DD/MM/YYYY")}</p>
          <p><strong>Dias:</strong> ${dayjs(dataFim).diff(dayjs(dataInicio), "day") + 1} dias corridos</p>
          ${observacaoAdmin ? `
            <p><strong>Observação do responsável:</strong></p>
            <blockquote style="background: #f1f1f1; padding: 10px; border-left: 4px solid #5a40b6;">${observacaoAdmin}</blockquote>
          ` : ""}
          <p style="margin-top: 20px;">
            <a href="https://goepik-ponto.vercel.app/vacations" target="_blank"
              style="display:inline-block;padding:10px 20px;background-color:#5a40b6;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
              Ver minhas férias
            </a>
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.warn("⚠️ Erro ao enviar email de confirmação de férias:", err.message);
  }
}

const STATUS_VALIDOS = ["pendente", "aprovado", "reprovado"];

/**
 * Lista férias — admin/RH vê todas, leitor vê apenas as suas
 */
exports.listarFerias = async (req, res) => {
  try {
    const { role, email } = req.user;
    const isAdminOrRH = role === "admin" || role === "rh";

    let snap;

    if (isAdminOrRH) {
      snap = await db.collection("ferias").orderBy("dataInicio", "desc").get();
    } else {
      const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();
      if (userSnap.empty) return res.status(403).json({ error: "Usuário não encontrado." });
      const discordId = userSnap.docs[0].data().discordId;
      if (!discordId) return res.json([]);
      // Sem orderBy para evitar necessidade de índice composto no Firestore
      snap = await db.collection("ferias").where("discordId", "==", discordId).get();
    }

    const ferias = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.dataInicio < b.dataInicio ? 1 : -1));
    res.json(ferias);
  } catch (error) {
    console.error("Erro ao listar férias:", error);
    res.status(500).json({ error: "Erro ao listar férias." });
  }
};

/**
 * Solicita férias — todos os roles podem solicitar, cria com status pendente
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

    const nomeExibicao = userData.displayName || userData.usuario || email.split("@")[0];

    const ref = await db.collection("ferias").add({
      discordId: userData.discordId,
      usuario: nomeExibicao,
      email,
      dataInicio,
      dataFim,
      observacao: observacao?.trim() || null,
      status: "pendente",
      observacaoAdmin: null,
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    });

    await enviarEmailSolicitacaoFerias(nomeExibicao, dataInicio, dataFim);

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

    // Admin/RH não pode aprovar/reprovar suas próprias férias
    if (snap.data().email === req.user.email) {
      return res.status(403).json({ error: "Você não pode alterar o status das suas próprias férias." });
    }

    const feriasData = snap.data();

    await ref.update({
      status,
      observacaoAdmin: observacaoAdmin?.trim() || null,
      atualizadoEm: new Date().toISOString(),
    });

    // Envia email de confirmação ao solicitante (apenas aprovado/reprovado)
    if (status !== "pendente" && feriasData.email) {
      await enviarEmailConfirmacaoFerias(
        feriasData.email,
        feriasData.usuario,
        feriasData.dataInicio,
        feriasData.dataFim,
        status,
        observacaoAdmin?.trim() || null
      );
    }

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
