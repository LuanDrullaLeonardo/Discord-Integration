require("dotenv").config();
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Configuração do Firebase
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: "googleapis.com",
};

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Função para calcular horas trabalhadas
function calcularHorasTrabalhadas(entrada, saida, pausaMinutos = 60) {
  const [horaEntrada, minutoEntrada] = entrada.split(':').map(Number);
  const [horaSaida, minutoSaida] = saida.split(':').map(Number);
  
  const inicioMinutos = horaEntrada * 60 + minutoEntrada;
  const fimMinutos = horaSaida * 60 + minutoSaida;
  
  const totalMinutos = fimMinutos - inicioMinutos - pausaMinutos;
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  
  return `${horas}h ${minutos}m`;
}

// Cache de usuários para evitar múltiplas consultas
let usuariosCache = {};

// Função para carregar todos os usuários do Firebase
async function carregarUsuarios() {
  console.log("🔄 Carregando usuários do Firebase...");
  
  try {
    const snapshot = await db.collection("users").get();
    
    snapshot.docs.forEach(doc => {
      const userData = doc.data();
      if (userData.email && userData.discordId) {
        // Extrair diferentes variações do nome do email
        const emailPrefix = userData.email.split('@')[0];
        const nomeExtraido = emailPrefix.replace(/\./g, ' ');
        
        usuariosCache[userData.email] = userData;
        usuariosCache[emailPrefix] = userData;
        usuariosCache[nomeExtraido] = userData;
        
        // Se houver campo 'usuario', usar também
        if (userData.usuario) {
          usuariosCache[userData.usuario] = userData;
        }
      }
    });
    
    console.log(`✅ ${Object.keys(usuariosCache).length} variações de usuários carregadas`);
    console.log("📋 Usuários encontrados:", Object.keys(usuariosCache).filter(key => key.includes('@')));
    
  } catch (error) {
    console.error("❌ Erro ao carregar usuários:", error);
  }
}

// Função para obter discordId do usuário
async function getDiscordIdByName(nomeUsuario) {
  // Possíveis variações do nome para busca
  const variacoes = [
    nomeUsuario,
    nomeUsuario.toLowerCase(),
    nomeUsuario.toLowerCase().replace(/\s+/g, '.'),
    nomeUsuario.toLowerCase().replace(/\s+/g, ''),
    nomeUsuario.split(' ')[0].toLowerCase(), // Só o primeiro nome
  ];
  
  // Mapeamentos específicos conhecidos
  const mapeamentoEspecifico = {
    "Gustavo Haschich": ["gustavo", "gustavo.haschich"],
    "Vinicius Grzyb": ["vinicius", "vinicius.grzyb"],
    "Feliphe": ["feliphe", "felipe"],
    "Carlos Henrique": ["carlos", "carlos.henrique"],
    "Wellington Moscon - GoEpik": ["wellington", "wellington.moscon"],
    "Luan Drulla": ["luan", "luan.drulla"],
    "Erick": ["erick035576", "erick"],
    "Diogo Haschich": ["diogo_has", "diogo.haschich"]
  };
  
  if (mapeamentoEspecifico[nomeUsuario]) {
    variacoes.push(...mapeamentoEspecifico[nomeUsuario]);
  }
  
  // Buscar nas variações
  for (const variacao of variacoes) {
    if (usuariosCache[variacao]) {
      return {
        discordId: usuariosCache[variacao].discordId,
        usuario: usuariosCache[variacao].usuario || usuariosCache[variacao].email.split('@')[0]
      };
    }
  }
  
  console.warn(`⚠️ Usuário não encontrado: ${nomeUsuario}`);
  console.warn(`   Variações testadas: ${variacoes.join(', ')}`);
  return null;
}

// Dados dos registros organizados por data
const registrosPorData = {
  "2025-11-24": {
    entradas: [
      { nome: "Gustavo Haschich", hora: "08:01" },
      { nome: "Vinicius Grzyb", hora: "08:25" },
      { nome: "Feliphe", hora: "08:21" },
      { nome: "Carlos Henrique", hora: "08:56" },
      { nome: "Wellington Moscon - GoEpik", hora: "08:59" },
      { nome: "Luan Drulla", hora: "08:55" },
      { nome: "Erick", hora: "12:55" },
      { nome: "Diogo Haschich", hora: "14:00" }
    ],
    saidas: [
      { nome: "Gustavo Haschich", hora: "18:01" },
      { nome: "Vinicius Grzyb", hora: "17:51" },
      { nome: "Feliphe", hora: "17:22" },
      { nome: "Carlos Henrique", hora: "18:00" },
      { nome: "Wellington Moscon - GoEpik", hora: "18:03" },
      { nome: "Luan Drulla", hora: "19:48" },
      { nome: "Erick", hora: "19:00" },
      { nome: "Diogo Haschich", hora: "19:00" }
    ]
  },
  "2025-11-25": {
    entradas: [
      { nome: "Gustavo Haschich", hora: "08:05" },
      { nome: "Vinicius Grzyb", hora: "08:25" },
      { nome: "Feliphe", hora: "08:26" },
      { nome: "Carlos Henrique", hora: "08:57" },
      { nome: "Luan Drulla", hora: "08:59" },
      { nome: "Erick", hora: "12:58" },
      { nome: "Diogo Haschich", hora: "14:00" }
    ],
    saidas: [
      { nome: "Gustavo Haschich", hora: "17:48" },
      { nome: "Vinicius Grzyb", hora: "17:30" },
      { nome: "Feliphe", hora: "17:29" },
      { nome: "Carlos Henrique", hora: "19:13" },
      { nome: "Luan Drulla", hora: "18:02" },
      { nome: "Erick", hora: "19:00" },
      { nome: "Diogo Haschich", hora: "18:01" }
    ]
  },
  "2025-11-26": {
    entradas: [
      { nome: "Gustavo Haschich", hora: "08:09" },
      { nome: "Vinicius Grzyb", hora: "08:37" },
      { nome: "Feliphe", hora: "08:27" },
      { nome: "Carlos Henrique", hora: "08:55" },
      { nome: "Luan Drulla", hora: "09:00" },
      { nome: "Erick", hora: "12:55" },
      { nome: "Diogo Haschich", hora: "14:00" }
    ],
    saidas: [
      { nome: "Gustavo Haschich", hora: "18:04" },
      { nome: "Vinicius Grzyb", hora: "18:05" },
      { nome: "Feliphe", hora: "17:27" },
      { nome: "Carlos Henrique", hora: "18:00" },
      { nome: "Luan Drulla", hora: "20:03" },
      { nome: "Erick", hora: "19:00" },
      { nome: "Diogo Haschich", hora: "19:00" }
    ]
  },
  "2025-11-27": {
    entradas: [
      { nome: "Gustavo Haschich", hora: "08:01" },
      { nome: "Vinicius Grzyb", hora: "08:10" },
      { nome: "Feliphe", hora: "08:10" },
      { nome: "Carlos Henrique", hora: "08:59" },
      { nome: "Luan Drulla", hora: "08:56" },
      { nome: "Erick", hora: "12:55" },
      { nome: "Diogo Haschich", hora: "13:59" }
    ],
    saidas: [
      { nome: "Gustavo Haschich", hora: "17:28" },
      { nome: "Vinicius Grzyb", hora: "17:52" },
      { nome: "Feliphe", hora: "17:29" },
      { nome: "Carlos Henrique", hora: "18:47" },
      { nome: "Luan Drulla", hora: "17:52" },
      { nome: "Erick", hora: "19:00" },
      { nome: "Diogo Haschich", hora: "19:02" }
    ]
  },
  "2025-11-28": {
    entradas: [
      { nome: "Gustavo Haschich", hora: "08:02" },
      { nome: "Vinicius Grzyb", hora: "08:33" },
      { nome: "Feliphe", hora: "08:28" },
      { nome: "Carlos Henrique", hora: "08:52" },
      { nome: "Luan Drulla", hora: "08:54" },
      { nome: "Erick", hora: "12:56" },
      { nome: "Diogo Haschich", hora: "14:00" }
    ],
    saidas: [
      { nome: "Gustavo Haschich", hora: "16:58" },
      { nome: "Vinicius Grzyb", hora: "17:22" },
      { nome: "Feliphe", hora: "17:30" },
      { nome: "Carlos Henrique", hora: "20:03" },
      { nome: "Luan Drulla", hora: "21:00" },
      { nome: "Erick", hora: "19:00" },
      { nome: "Diogo Haschich", hora: "19:00" }
    ]
  }
};

async function inserirRegistros() {
  console.log("🚀 Iniciando inserção de registros de ponto...");
  
  // Carregar usuários primeiro
  await carregarUsuarios();
  
  const batch = db.batch();
  let totalInseridos = 0;

  for (const [data, registros] of Object.entries(registrosPorData)) {
    console.log(`\n📅 Processando data: ${data}`);
    
    // Criar mapa de entradas por usuário
    const entradasMap = {};
    registros.entradas.forEach(entrada => {
      entradasMap[entrada.nome] = entrada.hora;
    });
    
    // Criar mapa de saídas por usuário
    const saidasMap = {};
    registros.saidas.forEach(saida => {
      saidasMap[saida.nome] = saida.hora;
    });
    
    // Processar todos os usuários únicos
    const todosUsuarios = new Set([
      ...registros.entradas.map(e => e.nome),
      ...registros.saidas.map(s => s.nome)
    ]);
    
    for (const nomeUsuario of todosUsuarios) {
      const userData = await getDiscordIdByName(nomeUsuario);
      if (!userData) {
        console.warn(`⚠️ Pulando ${nomeUsuario} - discordId não encontrado`);
        continue;
      }
      
      const usuario = userData.usuario;
      const discordId = userData.discordId;
      const entrada = entradasMap[nomeUsuario];
      const saida = saidasMap[nomeUsuario];
      
      if (!entrada) {
        console.warn(`⚠️ Entrada não encontrada para ${nomeUsuario} em ${data}`);
        continue;
      }
      
      if (!saida) {
        console.warn(`⚠️ Saída não encontrada para ${nomeUsuario} em ${data}`);
        continue;
      }
      
      // Calcular pausa especial para Vinicius no dia 04/08
      let pausaMinutos = 60; // 1 hora padrão
      if (nomeUsuario === "Vinicius Grzyb" && data === "2025-08-04") {
        // Saída às 13:45, bem cedo, provavelmente sem pausa de almoço
        pausaMinutos = 0;
      }
      
      const totalHoras = calcularHorasTrabalhadas(entrada, saida, pausaMinutos);
      const totalPausas = pausaMinutos > 0 ? `1h 0m` : `0h 0m`;
      
      const registroId = `${usuario}_${data}`;
      const registroData = {
        usuario,
        data,
        entrada,
        saida,
        total_horas: totalHoras,
        total_pausas: totalPausas,
        discordId,
        pausas: pausaMinutos > 0 ? [
          {
            inicio: `${data}T12:00:00`,
            fim: `${data}T13:00:00`
          }
        ] : [],
        createdAt: new Date().toISOString(),
        manual: true,
        observacao: "Registro inserido via script de recuperação"
      };
      
      batch.set(db.collection("registros").doc(registroId), registroData);
      totalInseridos++;
      
      console.log(`✅ ${nomeUsuario} (${usuario}): ${entrada} - ${saida} = ${totalHoras}`);
    }
  }
  
  try {
    await batch.commit();
    console.log(`\n🎉 Script executado com sucesso!`);
    console.log(`📊 Total de registros inseridos: ${totalInseridos}`);
  } catch (error) {
    console.error("❌ Erro ao executar batch:", error);
  }
}

// Executar o script
inserirRegistros()
  .then(() => {
    console.log("✅ Script finalizado!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Erro geral:", error);
    process.exit(1);
  });