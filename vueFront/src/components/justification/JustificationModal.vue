<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { upsertJustificativa, deleteJustificativa, uploadJustificativaFile } from '@/services/justificativaService'
import { extrairMinutosDeString, formatarMinutosParaHoras } from '@/utils/timeUtils'
import Button from '@/components/ui/Button.vue'
import Label from '@/components/ui/Label.vue'
import Badge from '@/components/ui/Badge.vue'
import { X, Paperclip, Trash2, Check, XCircle, Clock } from 'lucide-vue-next'
import dayjs from 'dayjs'

const props = defineProps({
  record: { type: Object, required: true },
})
const emit = defineEmits(['close', 'saved'])

const auth = useAuthStore()
const { toast } = useToast()

const TIPOS = [
  { value: 'abono_parcial', label: 'Abono de horas faltantes', desc: 'Abona a diferença entre o trabalhado e a meta do dia' },
  { value: 'abono_dia',     label: 'Abono do dia inteiro',     desc: 'Considera o dia completo como cumprido (atestado, folga etc.)' },
  { value: 'horas_extras',  label: 'Horas extras',             desc: 'Registra o excedente positivo no banco de horas' },
  { value: 'informativo',   label: 'Apenas informativo',       desc: 'Sem impacto no saldo de horas' },
]

const TIPO_LABELS = Object.fromEntries(TIPOS.map(t => [t.value, t.label]))

const texto = ref(props.record.justificativa?.text ?? '')
const tipo = ref(props.record.justificativa?.tipo ?? '')
const observacaoAdmin = ref(props.record.justificativa?.observacaoAdmin ?? '')
const file = ref(null)
const loading = ref(false)
const deleting = ref(false)
const erros = ref({ texto: false, tipo: false })

// Preview do abono estimado (calculado localmente para o admin/leitor entender o impacto)
const previewAbono = computed(() => {
  if (!tipo.value || tipo.value === 'informativo') return null
  const saldoMin = props.record.banco_horas_min ?? 0
  // banco_horas_min já é (trabalhado - meta), então:
  // déficit = saldo negativo, excedente = saldo positivo
  if (tipo.value === 'abono_parcial') {
    const deficit = Math.max(0, -saldoMin)
    return deficit > 0 ? formatarMinutosParaHoras(deficit) : null
  }
  if (tipo.value === 'abono_dia') {
    // meta = trabalhado - saldo
    const trabalhado = extrairMinutosDeString(props.record.total_horas || '0h 0m')
    const meta = trabalhado - saldoMin
    return meta > 0 ? formatarMinutosParaHoras(meta) : null
  }
  if (tipo.value === 'horas_extras') {
    const excedente = Math.max(0, saldoMin)
    return excedente > 0 ? formatarMinutosParaHoras(excedente) : null
  }
  return null
})

const handleFileChange = (e) => {
  file.value = e.target.files[0] ?? null
}

const handleSave = async () => {
  // Leitor: texto e tipo são obrigatórios
  // Admin: apenas texto é obrigatório (tipo já foi definido pelo leitor)
  erros.value.texto = !texto.value.trim()
  erros.value.tipo = !auth.isAdminOrRH && !tipo.value

  if (erros.value.texto || erros.value.tipo) {
    toast({ type: 'warning', title: 'Atenção', message: 'Preencha os campos obrigatórios.' })
    return
  }

  loading.value = true
  try {
    let fileUrl = props.record.justificativa?.file ?? null
    if (file.value) {
      const res = await uploadJustificativaFile(file.value)
      fileUrl = res.url
    }

    await upsertJustificativa({
      registroId: props.record.id,
      texto: texto.value,
      tipo: tipo.value || undefined,
      fileUrl,
    })

    toast({ type: 'success', title: 'Sucesso', message: 'Justificativa salva!' })
    emit('saved')
    emit('close')
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao salvar justificativa.' })
  } finally {
    loading.value = false
  }
}

// Admin/RH: altera status da justificativa
const handleStatusChange = async (status) => {
  erros.value.texto = !texto.value.trim()
  if (erros.value.texto) {
    toast({ type: 'warning', title: 'Atenção', message: 'Descreva a justificativa antes de alterar o status.' })
    return
  }

  loading.value = true
  try {
    await upsertJustificativa({
      registroId: props.record.id,
      texto: texto.value,
      status,
      observacaoAdmin: observacaoAdmin.value,
    })

    const labels = { aprovado: 'aprovada', reprovado: 'reprovada', pendente: 'marcada como pendente' }
    toast({ type: 'success', title: 'Sucesso', message: `Justificativa ${labels[status]}!` })
    emit('saved')
    emit('close')
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao atualizar status.' })
  } finally {
    loading.value = false
  }
}

const handleDelete = async () => {
  deleting.value = true
  try {
    await deleteJustificativa({ registroId: props.record.id })
    toast({ type: 'success', title: 'Removido', message: 'Justificativa removida.' })
    emit('saved')
    emit('close')
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao remover justificativa.' })
  } finally {
    deleting.value = false
  }
}

const statusVariant = (s) => {
  if (s === 'aprovado') return 'success'
  if (s === 'reprovado') return 'destructive'
  return 'warning'
}
</script>

<template>
  <Teleport to="body">
    <!-- Overlay -->
    <div class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" @click.self="emit('close')">
      <!-- Modal -->
      <div class="bg-background rounded-xl border border-border shadow-xl w-full max-w-md animate-fade-in">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 class="font-semibold text-foreground">Justificativa</h2>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ dayjs(record.data).format('DD/MM/YYYY') }}
            </p>
          </div>
          <button @click="emit('close')" class="text-muted-foreground hover:text-foreground">
            <X class="h-5 w-5" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-4 space-y-4">
          <!-- Status atual -->
          <div v-if="record.justificativa" class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">Status atual:</span>
            <Badge :variant="statusVariant(record.justificativa.status)">
              {{ record.justificativa.status }}
            </Badge>
          </div>

          <!-- Saldo do dia (contexto visual) -->
          <div class="rounded-md bg-muted/50 px-3 py-2 text-sm flex items-center justify-between">
            <span class="text-muted-foreground">Saldo do dia:</span>
            <span
              class="font-mono font-semibold"
              :class="(record.banco_horas_min ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
            >
              {{ record.banco_horas ?? '—' }}
            </span>
          </div>

          <!-- Tipo (leitor seleciona; admin vê read-only) -->
          <div class="space-y-1.5">
            <Label>Tipo de justificativa</Label>
            <template v-if="!auth.isAdminOrRH">
              <select
                v-model="tipo"
                @change="erros.tipo = false"
                class="flex w-full rounded-md border bg-background text-foreground px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                :class="erros.tipo ? 'border-red-500 focus-visible:ring-red-500' : 'border-input'"
              >
                <option value="" disabled class="bg-background text-muted-foreground">Selecione o tipo...</option>
                <option v-for="t in TIPOS" :key="t.value" :value="t.value" class="bg-background text-foreground">{{ t.label }}</option>
              </select>
              <p v-if="erros.tipo" class="text-xs text-red-500">Selecione o tipo da justificativa.</p>
              <p v-else-if="tipo" class="text-xs text-muted-foreground">
                {{ TIPOS.find(t => t.value === tipo)?.desc }}
              </p>
            </template>
            <template v-else>
              <p class="text-sm font-medium text-foreground">
                {{ record.justificativa?.tipo ? TIPO_LABELS[record.justificativa.tipo] : '—' }}
              </p>
            </template>
          </div>

          <!-- Preview do abono estimado -->
          <div
            v-if="previewAbono"
            class="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-sm"
          >
            <span class="text-blue-700 dark:text-blue-300">
              <template v-if="tipo === 'horas_extras'">Horas extras a creditar ao aprovar:</template>
              <template v-else>Horas a abonar ao aprovar:</template>
            </span>
            <span class="font-mono font-semibold text-blue-800 dark:text-blue-200 ml-1">{{ previewAbono }}</span>
          </div>
          <div
            v-else-if="tipo && tipo !== 'informativo' && !previewAbono"
            class="rounded-md border border-muted px-3 py-2 text-xs text-muted-foreground"
          >
            <template v-if="tipo === 'horas_extras'">Nenhum excedente detectado neste dia.</template>
            <template v-else>Sem diferença a abonar neste dia.</template>
          </div>

          <!-- Texto -->
          <div class="space-y-1.5">
            <Label>Descrição</Label>
            <textarea
              v-model="texto"
              @input="erros.texto = false"
              rows="3"
              class="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              :class="erros.texto ? 'border-red-500 focus-visible:ring-red-500' : 'border-input'"
              placeholder="Descreva o motivo da justificativa..."
            />
            <p v-if="erros.texto" class="text-xs text-red-500">Descreva o motivo da justificativa.</p>
          </div>

          <!-- Arquivo (apenas leitores) -->
          <div v-if="!auth.isAdminOrRH" class="space-y-1.5">
            <Label>Anexo (opcional)</Label>
            <label class="flex items-center gap-2 cursor-pointer">
              <div class="flex items-center gap-2 border border-input rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent w-full">
                <Paperclip class="h-4 w-4 shrink-0" />
                <span class="truncate">{{ file ? file.name : (record.justificativa?.fileName ?? 'Selecionar arquivo') }}</span>
              </div>
              <input type="file" class="sr-only" @change="handleFileChange" accept=".pdf,.jpg,.jpeg,.png" />
            </label>
          </div>

          <!-- Campos exclusivos do Admin/RH -->
          <template v-if="auth.isAdminOrRH">
            <!-- Abono já calculado (se aprovado) -->
            <div v-if="record.justificativa?.status === 'aprovado' && record.justificativa?.abonoHoras" class="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-3 py-2 text-sm">
              <span class="text-green-700 dark:text-green-300">Abono aplicado:</span>
              <span class="font-mono font-semibold text-green-800 dark:text-green-200 ml-1">{{ record.justificativa.abonoHoras }}</span>
            </div>

            <!-- Observação do admin -->
            <div class="space-y-1.5">
              <Label>Observação (admin)</Label>
              <textarea
                v-model="observacaoAdmin"
                rows="2"
                class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                placeholder="Observação opcional para o colaborador..."
              />
            </div>

            <!-- Botões de status -->
            <div class="space-y-1.5">
              <Label>Alterar status</Label>
              <div class="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  class="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                  :loading="loading"
                  @click="handleStatusChange('aprovado')"
                >
                  <Check class="h-4 w-4" />
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  class="border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  :loading="loading"
                  @click="handleStatusChange('reprovado')"
                >
                  <XCircle class="h-4 w-4" />
                  Reprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  class="border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                  :loading="loading"
                  @click="handleStatusChange('pendente')"
                >
                  <Clock class="h-4 w-4" />
                  Pendente
                </Button>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between gap-2 p-4 border-t border-border">
          <Button
            v-if="record.justificativa"
            variant="destructive"
            size="sm"
            :loading="deleting"
            @click="handleDelete"
          >
            <Trash2 class="h-4 w-4" />
            Remover
          </Button>
          <div v-else />

          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="emit('close')">Cancelar</Button>
            <!-- Leitor salva com tipo; admin usa botões de status mas pode salvar observação -->
            <Button size="sm" :loading="loading" @click="handleSave">
              {{ auth.isAdminOrRH ? 'Salvar texto' : 'Salvar' }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
