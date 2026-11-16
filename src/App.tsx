import { useEffect, useState } from 'react';
import { initializeStorage } from './services/storages/initAppStorage';
import { LibraryView } from './features/library/libraryView';
import { ReaderView } from './features/reader/readerView';
import { BookWithProgress } from './services/db/booksRepo';
import { checkAndInstallUpdates } from './services/updater/checkForUpdates';
import './App.css';

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBook, setActiveBook] = useState<BookWithProgress | null>(null);

  useEffect(() => {
    initializeStorage()
      .then(async () => {
        setReady(true);
        await checkAndInstallUpdates();
      })
      .catch((err) => setError(String(err)));
  }, []);

  if (error) {
    return <div className="center-screen">Error al inicializar almacenamiento: {error}</div>;
  }

  if (!ready) {
    return <div className="center-screen">Cargando biblioteca...</div>;
  }

  if (activeBook) {
    return (
      <ReaderView
        book={activeBook}
        onBack={() => setActiveBook(null)}
        onSwitchBook={(nextBook) => setActiveBook(nextBook)}
      />
    );
  }

  return <LibraryView onOpenBook={(book) => setActiveBook(book)} />;
}

export default App;