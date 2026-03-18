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
};
