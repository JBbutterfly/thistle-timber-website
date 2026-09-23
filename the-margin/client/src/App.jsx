import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Editor from './components/Editor.jsx';
import HistoryView from './components/HistoryView.jsx';
import Login from './components/Login.jsx';
import { api } from './lib/api.js';
import { watchAuthState, signOutUser } from './lib/firebase.js';

function AuthedApp({ user }) {
  const [drafts, setDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [view, setView] = useState('editor');

  const refreshDrafts = useCallback(() => {
    return api
      .listDrafts()
      .then(setDrafts)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingDrafts(true);
    api
      .listDrafts()
      .then((list) => {
        setDrafts(list);
        if (list.length > 0) {
          setCurrentDraftId(list[0].id);
        } else {
          return api.createDraft({}).then((d) => {
            setCurrentDraftId(d.id);
            return refreshDrafts();
          });
        }
      })
      .finally(() => setLoadingDrafts(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);

  function handleSelectDraft(id) {
    setCurrentDraftId(id);
    setView('editor');
  }

  function handleOpenDraftFromHistory(id) {
    setCurrentDraftId(id);
    setView('editor');
  }

  async function handleNewDraft() {
    const d = await api.createDraft({});
    await refreshDrafts();
    setCurrentDraftId(d.id);
    setView('editor');
  }

  function handleDraftSaved() {
    refreshDrafts();
  }

  return (
    <div className="app-shell">
      <Sidebar
        drafts={drafts}
        currentDraftId={currentDraftId}
        view={view}
        loadingDrafts={loadingDrafts}
        userEmail={user.email}
        onSelectDraft={handleSelectDraft}
        onNewDraft={handleNewDraft}
        onShowHistory={() => setView('history')}
        onSignOut={signOutUser}
      />
      <div className="main-area">
        {view === 'history' && <HistoryView onOpenDraft={handleOpenDraftFromHistory} />}
        {view === 'editor' && currentDraftId && (
          <Editor draftId={currentDraftId} onDraftSaved={handleDraftSaved} />
        )}
        {view === 'editor' && !currentDraftId && !loadingDrafts && (
          <div className="empty-state">Create a draft to begin writing.</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking, null = signed out

  useEffect(() => watchAuthState(setUser), []);

  if (user === undefined) {
    return null; // brief check on load; avoids a login-screen flash for already-signed-in users
  }

  if (!user) {
    return <Login />;
  }

  return <AuthedApp user={user} />;
}
