import { Route, Routes } from 'react-router-dom'
import { OfflineBanner } from './components/OfflineBanner'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { DocumentDetail } from './screens/DocumentDetail'
import { LibraryHome } from './screens/LibraryHome'

export default function App() {
  const isOnline = useOnlineStatus()

  return (
    <>
      <OfflineBanner isOnline={isOnline} />
      <Routes>
        <Route path="/" element={<LibraryHome />} />
        <Route path="/document/:id" element={<DocumentDetail />} />
      </Routes>
    </>
  )
}
