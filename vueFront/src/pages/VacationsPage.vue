<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import { fetchFerias, solicitarFerias, atualizarStatusFerias, deletarFerias } from '@/services/feriasService'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Badge from '@/components/ui/Badge.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { Palmtree, Plus, Check, XCircle, Trash2, ChevronDown, ChevronUp } from 'lucide-vue-next'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'

dayjs.locale('pt-br')

const auth = useAuthStore()
const { toast } = useToast()

const ferias = ref([])
const loading = ref(true)
const saving = ref(false)
const expandedRows = ref(new Set())

const form = ref({ dataInicio: '', dataFim: '', observacao: '' })
const formErros = ref({ dataInicio: false, dataFim: false })
const showForm = ref(false)

// Para admin: observação ao alterar status
const observacaoAdmin = ref('')
const loadingStatusId = ref(null)

onMounted(loadFerias)

async function loadFerias() {
  try {
    loading.value = true
    ferias.value = await fetchFerias()
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao carregar férias.' })
  } finally {
    loading.value = false
  }
}

const handleSolicitar = async () => {
  formErros.value.dataInicio = !form.value.dataInicio
  formErros.value.dataFim = !form.value.dataFim

  if (formErros.value.dataInicio || formErros.value.dataFim) {
    toast({ type: 'warning', title: 'Atenção', message: 'Preencha as datas de início e fim.' })
    return
  }

  if (dayjs(form.value.dataFim).isBefore(dayjs(form.value.dataInicio))) {
    toast({ type: 'warning', title: 'Atenção', message: 'A data de fim deve ser igual ou posterior à de início.' })
    return
  }

  saving.value = true
  try {
    await solicitarFerias(form.value)
    toast({ type: 'success', title: 'Solicitado', message: 'Férias solicitadas com sucesso!' })
    form.value = { dataInicio: '', dataFim: '', observacao: '' }
    showForm.value = false
    await loadFerias()
  } catch (err) {
    const msg = err?.response?.data?.error || 'Falha ao solicitar férias.'
    toast({ type: 'error', title: 'Erro', message: msg })
  } finally {
    saving.value = false
  }
}

const handleStatus = async (id, status) => {
  loadingStatusId.value = id
  try {
    await atualizarStatusFerias(id, status, observacaoAdmin.value)
    const labels = { aprovado: 'aprovadas', reprovado: 'reprovadas' }
    toast({ type: 'success', title: 'Sucesso', message: `Férias ${labels[status]}!` })
    observacaoAdmin.value = ''
    await loadFerias()
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao atualizar status.' })
  } finally {
    loadingStatusId.value = null
  }
}

const handleDelete = async (item) => {
  try {
    await deletarFerias(item.id)
    toast({ type: 'success', title: 'Removido', message: 'Solicitação removida.' })
    await loadFerias()
  } catch (err) {
    const msg = err?.response?.data?.error || 'Falha ao remover.'
    toast({ type: 'error', title: 'Erro', message: msg })
  }
}

const toggleRow = (id) => {
  if (expandedRows.value.has(id)) expandedRows.value.delete(id)
  else expandedRows.value.add(id)
}

const diasCorridos = (inicio, fim) => dayjs(fim).diff(dayjs(inicio), 'day') + 1

const statusVariant = (s) => {
  if (s === 'aprovado') return 'success'
  if (s === 'reprovado') return 'destructive'
  return 'warning'
}

const pendentesCount = computed(() => ferias.value.filter(f => f.status === 'pendente').length)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-2xl font-bold text-foreground flex items-center gap-2">
          <Palmtree class="h-6 w-6 text-primary" />
          Férias
        </h1>
        <p class="text-sm text-muted-foreground mt-1">
          Solicite e acompanhe férias.{{ auth.isAdminOrRH ? ' Como admin/RH, você também pode aprovar solicitações de outros.' : '' }}
        </p>
      </div>
      <Button size="sm" @click="showForm = !showForm">
        <Plus class="h-4 w-4" />
        Solicitar Férias
      </Button>
    </div>

    <!-- Banner de pendentes (admin/RH) -->
    <div
      v-if="auth.isAdminOrRH && pendentesCount > 0"
      class="flex items-center gap-3 rounded-lg border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-3"
    >
      <p class="text-sm text-yellow-800 dark:text-yellow-300 font-medium">
        {{ pendentesCount }} solicitação{{ pendentesCount > 1 ? 'ões' : '' }} de férias pendente{{ pendentesCount > 1 ? 's' : '' }} de aprovação
      </p>
    </div>

    <!-- Formulário de solicitação -->
    <Card v-if="showForm" class="p-4">
      <h3 class="font-medium text-sm text-foreground mb-4">Nova Solicitação</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1.5">
          <Label>Data de início *</Label>
          <Input
            v-model="form.dataInicio"
            type="date"
            @change="formErros.dataInicio = false"
            :class="formErros.dataInicio ? 'border-red-500' : ''"
          />
        </div>
        <div class="space-y-1.5">
          <Label>Data de fim *</Label>
          <Input
            v-model="form.dataFim"
            type="date"
            @change="formErros.dataFim = false"
            :class="formErros.dataFim ? 'border-red-500' : ''"
          />
        </div>
        <div class="space-y-1.5 sm:col-span-2">
          <Label>Observação (opcional)</Label>
          <Input v-model="form.observacao" placeholder="Ex: Viagem marcada" />
        </div>
      </div>
      <div class="flex gap-2 mt-4">
        <Button :loading="saving" @click="handleSolicitar">Solicitar</Button>
        <Button variant="outline" @click="showForm = false">Cancelar</Button>
      </div>
    </Card>

    <!-- Lista -->
    <Card class="overflow-hidden">
      <div v-if="loading" class="p-4 space-y-3">
        <Skeleton v-for="i in 5" :key="i" class="h-16 w-full" />
      </div>

      <template v-else-if="ferias.length">
        <!-- Tabela: md e acima -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-border bg-muted/50">
              <tr>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground w-8"></th>
                <th v-if="auth.isAdminOrRH" class="text-left px-4 py-3 font-medium text-muted-foreground">Colaborador</th>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">Período</th>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">Dias</th>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th class="text-left px-4 py-3 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              <template v-for="item in ferias" :key="item.id">
                <tr class="hover:bg-muted/30 transition-colors">
                  <td class="px-4 py-3">
                    <button @click="toggleRow(item.id)" class="text-muted-foreground hover:text-foreground">
                      <ChevronDown v-if="!expandedRows.has(item.id)" class="h-4 w-4" />
                      <ChevronUp v-else class="h-4 w-4" />
                    </button>
                  </td>
                  <td v-if="auth.isAdminOrRH" class="px-4 py-3 text-foreground font-medium">{{ item.usuario }}</td>
                  <td class="px-4 py-3 text-foreground font-mono">
                    {{ dayjs(item.dataInicio).format('DD/MM/YYYY') }} – {{ dayjs(item.dataFim).format('DD/MM/YYYY') }}
                  </td>
                  <td class="px-4 py-3 text-foreground">{{ diasCorridos(item.dataInicio, item.dataFim) }} dias</td>
                  <td class="px-4 py-3">
                    <Badge :variant="statusVariant(item.status)">{{ item.status }}</Badge>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1">
                      <template v-if="auth.isAdminOrRH && item.status === 'pendente' && item.email !== auth.user?.email">
                        <Button size="sm" variant="outline" class="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950" :loading="loadingStatusId === item.id" @click="handleStatus(item.id, 'aprovado')">
                          <Check class="h-4 w-4" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" class="border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" :loading="loadingStatusId === item.id" @click="handleStatus(item.id, 'reprovado')">
                          <XCircle class="h-4 w-4" /> Reprovar
                        </Button>
                      </template>
                      <template v-else-if="auth.isAdminOrRH && item.status === 'reprovado' && item.email !== auth.user?.email">
                        <Button size="sm" variant="outline" :loading="loadingStatusId === item.id" @click="handleStatus(item.id, 'pendente')">Reabrir</Button>
                      </template>
                      <Button v-if="item.status === 'pendente' && item.email === auth.user?.email" size="sm" variant="ghost" class="text-muted-foreground hover:text-destructive" @click="handleDelete(item)">
                        <Trash2 class="h-4 w-4" /> Cancelar
                      </Button>
                      <Button v-if="auth.isAdminOrRH" size="sm" variant="ghost" class="text-muted-foreground hover:text-destructive" @click="handleDelete(item)">
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
                <tr v-if="expandedRows.has(item.id)" class="bg-muted/20">
                  <td :colspan="auth.isAdminOrRH ? 6 : 5" class="px-8 py-3">
                    <div class="space-y-1 text-xs text-muted-foreground">
                      <p v-if="item.observacao"><span class="font-medium">Observação:</span> {{ item.observacao }}</p>
                      <p v-if="item.observacaoAdmin"><span class="font-medium">Obs. admin:</span> {{ item.observacaoAdmin }}</p>
                      <p><span class="font-medium">Solicitado em:</span> {{ dayjs(item.criadoEm).format('DD/MM/YYYY HH:mm') }}</p>
                      <p v-if="!item.observacao && !item.observacaoAdmin" class="italic">Sem observações.</p>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <!-- Cards: mobile (< md) -->
        <div class="md:hidden divide-y divide-border">
          <div v-for="item in ferias" :key="item.id" class="p-4 space-y-3">
            <!-- Linha principal -->
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-1 min-w-0">
                <p v-if="auth.isAdminOrRH" class="text-sm font-semibold text-foreground truncate">{{ item.usuario }}</p>
                <p class="text-sm text-foreground">
                  {{ dayjs(item.dataInicio).format('DD/MM/YY') }} – {{ dayjs(item.dataFim).format('DD/MM/YY') }}
                  <span class="text-muted-foreground text-xs ml-1">({{ diasCorridos(item.dataInicio, item.dataFim) }} dias)</span>
                </p>
                <Badge :variant="statusVariant(item.status)" class="text-xs">{{ item.status }}</Badge>
              </div>
              <button @click="toggleRow(item.id)" class="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
                <ChevronDown v-if="!expandedRows.has(item.id)" class="h-4 w-4" />
                <ChevronUp v-else class="h-4 w-4" />
              </button>
            </div>

            <!-- Expandido: observações -->
            <div v-if="expandedRows.has(item.id)" class="space-y-1 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
              <p v-if="item.observacao"><span class="font-medium">Observação:</span> {{ item.observacao }}</p>
              <p v-if="item.observacaoAdmin"><span class="font-medium">Obs. admin:</span> {{ item.observacaoAdmin }}</p>
              <p><span class="font-medium">Solicitado em:</span> {{ dayjs(item.criadoEm).format('DD/MM/YYYY HH:mm') }}</p>
              <p v-if="!item.observacao && !item.observacaoAdmin" class="italic">Sem observações.</p>
            </div>

            <!-- Ações -->
            <div class="flex flex-wrap gap-2">
              <template v-if="auth.isAdminOrRH && item.status === 'pendente' && item.email !== auth.user?.email">
                <Button size="sm" variant="outline" class="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950" :loading="loadingStatusId === item.id" @click="handleStatus(item.id, 'aprovado')">
                  <Check class="h-4 w-4" /> Aprovar
                </Button>
                <Button size="sm" variant="outline" class="border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" :loading="loadingStatusId === item.id" @click="handleStatus(item.id, 'reprovado')">
                  <XCircle class="h-4 w-4" /> Reprovar
                </Button>
              </template>
              <template v-else-if="auth.isAdminOrRH && item.status === 'reprovado' && item.email !== auth.user?.email">
                <Button size="sm" variant="outline" :loading="loadingStatusId === item.id" @click="handleStatus(item.id, 'pendente')">Reabrir</Button>
              </template>
              <Button v-if="item.status === 'pendente' && item.email === auth.user?.email" size="sm" variant="ghost" class="text-muted-foreground hover:text-destructive" @click="handleDelete(item)">
                <Trash2 class="h-4 w-4" /> Cancelar
              </Button>
              <Button v-if="auth.isAdminOrRH" size="sm" variant="ghost" class="text-muted-foreground hover:text-destructive" @click="handleDelete(item)">
                <Trash2 class="h-4 w-4" /> Remover
              </Button>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Palmtree class="h-10 w-10 opacity-30" />
        <p class="text-sm">
          {{ auth.isAdminOrRH ? 'Nenhuma solicitação de férias.' : 'Você ainda não solicitou férias.' }}
        </p>
      </div>
    </Card>
  </div>
</template>
