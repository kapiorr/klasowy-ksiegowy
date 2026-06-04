export default function Zablokowany() {
  return (
    <div className="min-h-screen bg-paper dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-rose-100 rounded-2xl mb-6">
          <span className="text-4xl">🚫</span>
        </div>
        <h1 className="font-display text-3xl font-700 text-ink mb-3">Dostęp zablokowany</h1>
        <p className="font-body text-sage-600 mb-2">
          Twój adres IP został tymczasowo zablokowany z powodu zbyt wielu nieudanych prób logowania.
        </p>
        <p className="font-body text-sage-500 text-sm mb-8">
          Blokada wygasa automatycznie po <strong>1 godzinie</strong>.
          Jeśli uważasz że to pomyłka, skontaktuj się z administratorem.
        </p>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-rose-100 dark:border-red-900/40 px-6 py-4 font-body text-sm text-sage-500 dark:text-gray-400">
          Jeśli jesteś administratorem — zaloguj się z innego adresu IP i odblokuj w sekcji <strong>Logi → Blokady</strong>.
        </div>
      </div>
    </div>
  );
}
