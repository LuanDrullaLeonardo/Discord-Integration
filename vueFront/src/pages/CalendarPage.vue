<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import VueCal from 'vue-cal'
import 'vue-cal/dist/vuecal.css'
import ptBr from 'vue-cal/dist/i18n/pt-br.es.js'
import { fetchCalendario } from '@/services/calendarioService'
import { useToast } from '@/composables/useToast'
import Card from '@/components/ui/Card.vue'
import { CalendarDays } from 'lucide-vue-next'
import dayjs from 'dayjs'

const { toast } = useToast()

const defaultView = window.innerWidth < 640 ? 'week' : 'month'

const activeDate = ref(dayjs().format('YYYY-MM-DD'))
const loading = ref(false)
const eventos = ref([])
let ultimoAnoMes = ''

const anoMes = computed(() => {
  const d = dayjs(activeDate.value)
  return { ano: d.year(), mes: d.month() + 1 }
})

const TOTAL_CORES = 8

// Mapeia cada usuário para um índice de cor fixo
const coresUsuarios = {}
let corIdx = 0
function classeParaUsuario(usuario) {
  if (coresUsuarios[usuario] === undefined) {
    coresUsuarios[usuario] = corIdx % TOTAL_CORES
    corIdx++
  }
  return `evento-ferias evento-ferias-${coresUsuarios[usuario]}`
}

async function carregarEventos() {
  const { ano, mes } = anoMes.value
  const chave = `${ano}-${mes}`
  if (chave === ultimoAnoMes) return
  ultimoAnoMes = chave

  loading.value = true
  try {
    const { feriados, ferias } = await fetchCalendario(ano, mes)

    const evs = []

    // Feriados — dia inteiro, cor cinza/âmbar conforme tipo
    for (const f of feriados) {
      evs.push({
        start: `${f.data} 00:00`,
        end: `${f.data} 23:59`,
        title: f.nome,
        class: (f.tipo || 'feriado') === 'feriado' ? 'evento-feriado' : f.tipo === 'day_off' ? 'evento-dayoff' : 'evento-facultativo',
      })
    }

    // Férias — período colorido por colaborador
    for (const f of ferias) {
      evs.push({
        start: `${f.dataInicio} 00:00`,
        end: `${f.dataFim} 23:59`,
        title: `🌴 ${f.usuario}`,
        class: classeParaUsuario(f.usuario),
      })
    }

    eventos.value = evs
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao carregar calendário.' })
  } finally {
    loading.value = false
  }
}

function onViewChange({ startDate, endDate }) {
  // Usa o ponto médio entre início e fim da view para detectar o mês correto
  // independente da view (mês, semana, dia) — evita empurrar para mês seguinte
  // na última semana do mês quando somamos dias fixos ao startDate
  const mid = dayjs(startDate).add(
    Math.floor(dayjs(endDate).diff(dayjs(startDate), 'day') / 2),
    'day'
  )
  activeDate.value = mid.format('YYYY-MM-DD')
}

onMounted(carregarEventos)
watch(anoMes, carregarEventos)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div>
      <h1 class="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
        <CalendarDays class="h-6 w-6 text-primary" />
        Calendário da Equipe
      </h1>
      <p class="text-sm text-muted-foreground mt-1">
        Férias aprovadas e feriados do time.
      </p>
    </div>

    <!-- Legenda -->
    <div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-3 h-3 rounded-sm bg-red-400"></span> Feriado
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-3 h-3 rounded-sm bg-yellow-400"></span> Ponto Facultativo
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-3 h-3 rounded-sm bg-green-500"></span> Day Off
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-3 h-3 rounded-sm bg-blue-400"></span> Férias (cor por colaborador)
      </span>
    </div>

    <!-- Calendário -->
    <Card class="overflow-hidden p-0 relative">
      <!-- Overlay de loading — não destrói o calendário -->
      <div
        v-if="loading"
        class="absolute inset-0 z-10 flex items-center justify-center bg-background/60 text-muted-foreground text-sm"
      >
        Carregando...
      </div>
      <VueCal
        locale="pt-br"
        :locale-data="ptBr"
        :default-view="defaultView"
        :time="false"
        :events="eventos"
        :on-event-click="() => {}"
        class="vuecal--goepik"
        @view-change="onViewChange"
      />
    </Card>
  </div>
</template>

<style>
/* Integração com o tema do sistema */
.vuecal--goepik {
  border: none;
  font-family: inherit;
  min-height: 340px;
}

@media (min-width: 640px) {
  .vuecal--goepik {
    min-height: 500px;
  }
}

.vuecal--goepik .vuecal__header {
  background: hsl(var(--muted) / 0.5);
  border-bottom: 1px solid hsl(var(--border));
}

.vuecal--goepik .vuecal__title-bar {
  background: transparent;
  color: hsl(var(--foreground));
  font-weight: 600;
}

.vuecal--goepik .vuecal__title-bar button {
  color: hsl(var(--foreground));
}

.vuecal--goepik .vuecal__weekdays-headings {
  background: hsl(var(--muted) / 0.3);
  border-bottom: 1px solid hsl(var(--border));
}

.vuecal--goepik .vuecal__heading {
  color: hsl(var(--muted-foreground));
  font-size: 0.75rem;
  font-weight: 500;
}

.vuecal--goepik .vuecal__cell {
  border-color: hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}

.vuecal--goepik .vuecal__cell--today {
  background: hsl(var(--primary) / 0.06);
}

.vuecal--goepik .vuecal__cell--today .vuecal__cell-date {
  color: hsl(var(--primary));
  font-weight: 700;
}

.vuecal--goepik .vuecal__cell--out-of-scope {
  background: hsl(var(--muted) / 0.3);
  color: hsl(var(--muted-foreground));
}

.vuecal--goepik .vuecal__cell--weekend {
  background: hsl(var(--muted) / 0.2);
}

/* Eventos */
.vuecal--goepik .vuecal__event {
  border-radius: 4px;
  font-size: 0.7rem;
  padding: 1px 4px;
  cursor: default;
}

.vuecal--goepik .evento-feriado {
  background: #f87171 !important;
  border-color: #ef4444 !important;
  color: white !important;
}

.vuecal--goepik .evento-facultativo {
  background: #fbbf24 !important;
  border-color: #f59e0b !important;
  color: white !important;
}

.vuecal--goepik .evento-dayoff {
  background: #22c55e !important;
  border-color: #16a34a !important;
  color: white !important;
}

.vuecal--goepik .evento-ferias {
  color: white !important;
  font-weight: 500;
}

.vuecal--goepik .evento-ferias-0 { background: #3b82f6 !important; border-color: #3b82f6 !important; }
.vuecal--goepik .evento-ferias-1 { background: #8b5cf6 !important; border-color: #8b5cf6 !important; }
.vuecal--goepik .evento-ferias-2 { background: #ec4899 !important; border-color: #ec4899 !important; }
.vuecal--goepik .evento-ferias-3 { background: #f59e0b !important; border-color: #f59e0b !important; }
.vuecal--goepik .evento-ferias-4 { background: #10b981 !important; border-color: #10b981 !important; }
.vuecal--goepik .evento-ferias-5 { background: #06b6d4 !important; border-color: #06b6d4 !important; }
.vuecal--goepik .evento-ferias-6 { background: #f97316 !important; border-color: #f97316 !important; }
.vuecal--goepik .evento-ferias-7 { background: #6366f1 !important; border-color: #6366f1 !important; }

/* Mobile: week view compacta */
@media (max-width: 639px) {
  .vuecal--goepik .vuecal__heading {
    font-size: 0.6rem;
    padding: 0 2px;
  }

  .vuecal--goepik .vuecal__cell-date {
    font-size: 0.65rem;
  }

  .vuecal--goepik .vuecal__event {
    font-size: 0.6rem;
    padding: 1px 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vuecal--goepik .vuecal__title-bar {
    font-size: 0.85rem;
  }

  .vuecal--goepik .vuecal__arrow {
    width: 24px;
  }
}
</style>
