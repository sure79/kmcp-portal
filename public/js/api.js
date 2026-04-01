// API 호출 헬퍼
const api = {
  async request(method, url, data) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (data) opts.body = JSON.stringify(data);
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '요청 실패');
    return json;
  },
  get: (url) => api.request('GET', url),
  post: (url, data) => api.request('POST', url, data),
  put: (url, data) => api.request('PUT', url, data),
  patch: (url, data) => api.request('PATCH', url, data),
  delete: (url) => api.request('DELETE', url),

  users: {
    list: (all) => api.get(`/api/users${all ? '?all=1' : ''}`),
    pending: () => api.get('/api/users/pending'),
    create: (d) => api.post('/api/users', d),
    register: (d) => api.post('/api/users/register', d),
    approve: (id) => api.post(`/api/users/${id}/approve`),
    reject: (id) => api.post(`/api/users/${id}/reject`),
    update: (id, d) => api.put(`/api/users/${id}`, d),
    delete: (id) => api.delete(`/api/users/${id}`),
    login: (d) => api.post('/api/users/login', d),
    logout: () => api.post('/api/users/logout'),
    me: () => api.get('/api/users/me'),
  },
  reports: {
    team: (date) => api.get(`/api/reports/team?date=${date}`),
    list: (p) => api.get(`/api/reports?${new URLSearchParams(p)}`),
    weeklySummary: (start, end) => api.get(`/api/reports/weekly-summary?start=${start}&end=${end}`),
    save: (d) => api.post('/api/reports', d),
    delete: (id) => api.delete(`/api/reports/${id}`),
  },
  meetings: {
    list: (p) => api.get(`/api/meetings?${new URLSearchParams(p)}`),
    get: (id) => api.get(`/api/meetings/${id}`),
    create: (d) => api.post('/api/meetings', d),
    update: (id, d) => api.put(`/api/meetings/${id}`, d),
    delete: (id) => api.delete(`/api/meetings/${id}`),
    confirm: (id, userId) => api.post(`/api/meetings/${id}/confirm`, { user_id: userId }),
  },
  transcribe: {
    audio: async (file) => {
      const form = new FormData();
      form.append('audio', file);
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '분석 실패');
      return json;
    },
  },
  tasks: {
    list: (p) => api.get(`/api/tasks?${new URLSearchParams(p||{})}`),
    get: (id) => api.get(`/api/tasks/${id}`),
    create: (d) => api.post('/api/tasks', d),
    update: (id, d) => api.put(`/api/tasks/${id}`, d),
    move: (id, d) => api.patch(`/api/tasks/${id}/move`, d),
    reorder: (items) => api.patch('/api/tasks/reorder', { items }),
    delete: (id) => api.delete(`/api/tasks/${id}`),
  },
  projects: {
    list: () => api.get('/api/projects'),
    get: (id) => api.get(`/api/projects/${id}`),
    create: (d) => api.post('/api/projects', d),
    update: (id, d) => api.put(`/api/projects/${id}`, d),
    delete: (id) => api.delete(`/api/projects/${id}`),
  },
  notices: {
    list: () => api.get('/api/notices'),
    create: (d) => api.post('/api/notices', d),
    update: (id, d) => api.put(`/api/notices/${id}`, d),
    delete: (id) => api.delete(`/api/notices/${id}`),
  },
  status: {
    list: (date) => api.get(`/api/status?date=${date || ''}`),
    set: (d) => api.post('/api/status', d),
  },
  lunch: {
    get: (date) => api.get(`/api/lunch?date=${date || ''}`),
    create: (d) => api.post('/api/lunch', d),
    vote: (d) => api.post('/api/lunch/vote', d),
    delete: (id) => api.delete(`/api/lunch/${id}`),
  },
  notifications: {
    list: () => api.get('/api/notifications'),
    history: (p) => api.get(`/api/notifications/history?${new URLSearchParams(p||{})}`),
    readAll: () => api.post('/api/notifications/read-all'),
  },
  suggestions: {
    list: () => api.get('/api/suggestions'),
    create: (d) => api.post('/api/suggestions', d),
    like: (id, userId) => api.post(`/api/suggestions/${id}/like`, { user_id: userId }),
    reply: (id, d) => api.post(`/api/suggestions/${id}/reply`, d),
    delete: (id) => api.delete(`/api/suggestions/${id}`),
  },
  polls: {
    list: () => api.get('/api/polls'),
    create: (d) => api.post('/api/polls', d),
    vote: (id, userId, optionIds) => api.post(`/api/polls/${id}/vote`, { user_id: userId, option_ids: optionIds }),
    close: (id) => api.post(`/api/polls/${id}/close`),
    delete: (id) => api.delete(`/api/polls/${id}`),
  },
  search: (q) => api.get(`/api/search?q=${encodeURIComponent(q)}`),
};
