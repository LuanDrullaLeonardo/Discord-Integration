import api from './api'

export async function fetchFerias() {
  const { data } = await api.get('/ferias')
  return data
}

export async function solicitarFerias({ dataInicio, dataFim, observacao }) {
  const { data } = await api.post('/ferias', { dataInicio, dataFim, observacao })
  return data
}

export async function atualizarStatusFerias(id, status, observacaoAdmin = '') {
  const { data } = await api.patch(`/ferias/${id}/status`, { status, observacaoAdmin })
  return data
}

export async function deletarFerias(id) {
  const { data } = await api.delete(`/ferias/${id}`)
  return data
}
