<script setup>
import { ref, onMounted } from 'vue'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/config/firebase'
import { fetchSpecialDates, addSpecialDate, deleteSpecialDate } from '@/services/specialDateService'
import { useToast } from '@/composables/useToast'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import Badge from '@/components/ui/Badge.vue'
import { CalendarDays, Plus, Trash2 } from 'lucide-vue-next'
import dayjs from 'dayjs'

const { toast } = useToast()
const dates = ref([])
const users = ref([])
const loading = ref(true)
const saving = ref(false)

const form = ref({
  data: '',
  descricao: '',
  tipo: 'feriado',
  usuarioDiscordId: '',
})

onMounted(async () => {
  await Promise.all([loadDates(), loadUsers()])
})

const loadDates = async () => {
  try {
    loading.value = true
    dates.value = await fetchSpecialDates()
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao carregar datas.' })
  } finally {
    loading.value = false
  }
}

const loadUsers = async () => {
  try {
    const snap = await getDocs(collection(db, 'users'))
    users.value = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => u.role === 'leitor')
      .sort((a, b) => (a.displayName || a.usuario || '').localeCompare(b.displayName || b.usuario || ''))
  } catch {
    // silencioso — select ficará vazio
  }
}

const TIPO_VARIANT = {
  'feriado': 'destructive',
  'ponto-facultativo': 'warning',
  'day_off': 'default',
  'outro': 'secondary',
}

const TIPO_LABEL = {
  'feriado': 'Feriado',
  'ponto-facultativo': 'Ponto Facultativo',
  'day_off': 'Day Off',
  'outro': 'Outro',
}

const handleAdd = async () => {
  if (!form.value.data || !form.value.descricao) {
    toast({ type: 'warning', title: 'Atenção', message: 'Preencha todos os campos.' })
    return
  }
  if (form.value.tipo === 'day_off' && !form.value.usuarioDiscordId) {
    toast({ type: 'warning', title: 'Atenção', message: 'Selecione o colaborador para o Day Off.' })
    return
  }
  saving.value = true
  try {
    const usuarios = form.value.tipo === 'day_off' ? [form.value.usuarioDiscordId] : []
    await addSpecialDate({ ...form.value, usuarios })
    toast({ type: 'success', title: 'Sucesso', message: 'Data adicionada.' })
    form.value = { data: '', descricao: '', tipo: 'feriado', usuarioDiscordId: '' }
    await loadDates()
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao adicionar data.' })
  } finally {
    saving.value = false
  }
}

const handleDelete = async (item) => {
  try {
    await deleteSpecialDate(item.data)
    toast({ type: 'success', title: 'Removido', message: 'Data removida.' })
    await loadDates()
  } catch {
    toast({ type: 'error', title: 'Erro', message: 'Falha ao remover data.' })
  }
}

const nomeUsuario = (discordId) => {
  const u = users.value.find(u => u.discordId === discordId)
  return u ? (u.displayName || u.usuario || discordId) : discordId
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-2xl font-bold text-foreground flex items-center gap-2">
        <CalendarDays class="h-6 w-6 text-primary" />
        Gerenciar Feriados
      </h1>
      <p class="text-sm text-muted-foreground mt-1">
        Adicione ou remova datas especiais do sistema.
      </p>
    </div>

    <!-- Add form -->
    <Card class="p-4">
      <h3 class="font-medium text-sm text-foreground mb-4">Adicionar Nova Data</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="space-y-1.5">
          <Label>Data *</Label>
          <Input v-model="form.data" type="date" />
        </div>
        <div class="space-y-1.5">
          <Label>Descrição *</Label>
          <Input v-model="form.descricao" placeholder="Ex: Natal" />
        </div>
        <div class="space-y-1.5">
          <Label>Tipo</Label>
          <select
            v-model="form.tipo"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="feriado">Feriado</option>
            <option value="ponto-facultativo">Ponto Facultativo</option>
            <option value="day_off">Day Off</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div v-if="form.tipo === 'day_off'" class="space-y-1.5 sm:col-span-3">
          <Label>Colaborador *</Label>
          <select
            v-model="form.usuarioDiscordId"
            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled>Selecione o colaborador</option>
            <option v-for="u in users" :key="u.discordId" :value="u.discordId">
              {{ u.displayName || u.usuario || u.email }}
            </option>
          </select>
        </div>
      </div>
      <Button class="mt-4" :loading="saving" @click="handleAdd">
        <Plus class="h-4 w-4" />
        Adicionar
      </Button>
    </Card>

    <!-- List -->
    <Card class="overflow-hidden">
      <div class="px-4 py-3 border-b border-border">
        <h3 class="font-medium text-sm text-foreground">Datas Cadastradas</h3>
      </div>

      <div v-if="loading" class="p-4 space-y-2">
        <Skeleton v-for="i in 5" :key="i" class="h-12 w-full" />
      </div>

      <div v-else-if="dates.length" class="divide-y divide-border">
        <div
          v-for="item in dates"
          :key="item.id ?? item.data"
          class="flex items-center justify-between px-4 py-3 hover:bg-muted/30"
        >
          <div>
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium text-foreground">{{ item.nome ?? item.descricao }}</p>
              <Badge :variant="TIPO_VARIANT[item.tipo || 'feriado']" class="text-xs">
                {{ TIPO_LABEL[item.tipo || 'feriado'] }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ dayjs(item.data).format('DD/MM/YYYY') }}
              <span v-if="item.tipo === 'day_off' && item.usuarios?.length">
                — {{ item.usuarios.map(nomeUsuario).join(', ') }}
              </span>
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="text-muted-foreground hover:text-destructive"
            @click="handleDelete(item)"
          >
            <Trash2 class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div v-else class="py-12 text-center text-muted-foreground text-sm">
        Nenhuma data especial cadastrada.
      </div>
    </Card>
  </div>
</template>
