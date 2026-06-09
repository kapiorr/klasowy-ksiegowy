import { createContext, useContext, useState, useCallback } from 'react';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const confirm = useCallback((message) => {
    return new Promise((resolve) => {
      setDialog({ type: 'confirm', message, resolve });
    });
  }, []);

  const alert = useCallback((message, type = 'info') => {
    return new Promise((resolve) => {
      setDialog({ type: 'alert', message, alertType: type, resolve });
    });
  }, []);

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4"
          onClick={() => dialog.type === 'alert' && close(true)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm"
            onClick={e => e.stopPropagation()}>
            <div className="p-6">
              {dialog.type === 'alert' && (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl mb-4 mx-auto ${
                  dialog.alertType === 'error' ? 'bg-rose-100 text-rose-500' :
                  dialog.alertType === 'success' ? 'bg-sage-100 text-sage-600' :
                  'bg-sage-100 text-sage-600'
                }`}>
                  {dialog.alertType === 'error' ? '✕' : dialog.alertType === 'success' ? '✓' : 'i'}
                </div>
              )}
              <p className="font-body text-ink dark:text-gray-100 text-center whitespace-pre-line">{dialog.message}</p>
            </div>
            <div className={`px-6 pb-6 flex gap-3 ${dialog.type === 'confirm' ? '' : 'justify-center'}`}>
              {dialog.type === 'confirm' ? (<>
                <button onClick={() => close(false)}
                  className="flex-1 border border-sage-200 dark:border-gray-600 rounded-xl py-2.5 font-body text-ink dark:text-gray-100 hover:bg-sage-50 dark:hover:bg-gray-700">
                  Anuluj
                </button>
                <button onClick={() => close(true)}
                  className="flex-1 bg-ink dark:bg-gray-900 text-white rounded-xl py-2.5 font-display font-600 hover:bg-sage-700">
                  Tak
                </button>
              </>) : (
                <button onClick={() => close(true)}
                  className="bg-ink dark:bg-gray-900 text-white rounded-xl py-2.5 px-8 font-display font-600 hover:bg-sage-700">
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  return useContext(DialogContext);
}
