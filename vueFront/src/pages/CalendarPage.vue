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

const activeDate = ref(dayjs().format('YYYY-MM-DD'))
const loading = ref(false)
const eventos = ref([])
let ultimoAnoMes = ''

const anoMes = computed(() => {
  const d = dayjs(activeDate.value)
  return { ano: d.year(), mes: d.month() + 1 }
})

const CORES_FERIAS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#6366f1',
]

// Mapeia cada usuário para uma cor fixa
const coresUsuarios = {}
let corIdx = 0
function corParaUsuario(usuario) {
  if (!coresUsuarios[usuario]) {
    coresUsuarios[usuario] = CORES_FERIAS[corIdx % CORES_FERIAS.length]
    corIdx++
  }
  return coresUsuarios[usuario]
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
        start: f.data,
        end: f.data,
        title: f.nome,
        allDay: true,
        class: f.tipo === 'feriado' ? 'evento-feriado' : 'evento-facultativo',
      })
    }

    // Férias — período colorido por colaborador
    for (const f of ferias) {
      const cor = corParaUsuario(f.usuario)
      evs.push({
        start: f.dataInicio,
        end: f.dataFim,
        title: `🌴 ${f.usuario}`,
        allDay: true,
        style: `background: ${cor}; border-color: ${cor};`,
        class: 'evento-ferias',
      })
    }

    eventos.value = evs
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao carregar calendário.' })
  } finally {
    loading.value = false
  }
}

function onViewChange({ startDate }) {
  activeDate.value = dayjs(startDate).add(15, 'day').format('YYYY-MM-DD')
}

onMounted(carregarEventos)
watch(anoMes, carregarEventos)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-foreground flex items-center gap-2">
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
        default-view="month"
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
  min-height: 500px;
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

.vuecal--goepik .evento-ferias {
  color: white !important;
  font-weight: 500;
}
</style>
