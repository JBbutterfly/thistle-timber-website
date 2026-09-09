async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listDrafts: () => request('/drafts'),
  createDraft: (data) => request('/drafts', { method: 'POST', body: JSON.stringify(data || {}) }),
  getDraft: (id) => request(`/drafts/${id}`),
  saveDraft: (id, updates) => request(`/drafts/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteDraft: (id) => request(`/drafts/${id}`, { method: 'DELETE' }),
  provoke: (id, text) => request(`/drafts/${id}/provoke`, { method: 'POST', body: JSON.stringify({ text }) }),
  updateNote: (draftId, noteId, updates) =>
    request(`/drafts/${draftId}/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  getHistory: () => request('/history'),
};
