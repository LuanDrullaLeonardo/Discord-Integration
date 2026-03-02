import api from './api'

export async function fetchCalendario(ano, mes) {
  const { data } = await api.get(`/calendario/${ano}/${mes}`)
  return data
}
