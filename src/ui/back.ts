// Кнопка «Назад» телефона (и браузера). Пока открыт лист, знакомство или не главный раздел,
// в истории браузера лежит одна наша запись-заглушка. «Назад» снимает её, и вместо выхода
// из приложения мы закрываем то, что открыто. Когда закрывать нечего, заглушки нет,
// и «Назад» работает как обычно.
import { useEffect, useRef } from 'preact/hooks';

const MARK = 'lagerBack';

const isOurs = (state: unknown) => !!state && typeof state === 'object' && (state as Record<string, unknown>)[MARK] === true;

/** Закрытие открытого листа: лист сам говорит, как его закрыть, так же как по Escape. */
let sheetClose: (() => void) | null = null;

/** Лист сообщает, как его закрыть; вернёт отмену. */
export function setSheetBack(close: () => void): () => void {
  sheetClose = close;
  return () => {
    if (sheetClose === close) sheetClose = null;
  };
}

/** Как закрыть открытый лист, если он об этом сказал. */
export const sheetBack = () => sheetClose;

/**
 * Держать заглушку в истории, пока need, и звать onBack, когда её сняли кнопкой «Назад».
 * Если закрыли кнопкой на экране, заглушку убираем сами, чтобы следующее «Назад» не пропадало впустую.
 */
export function useBackButton(need: boolean, onBack: () => void): void {
  const st = useRef({ guarded: false, leaving: false, need, onBack });
  st.current.need = need;
  st.current.onBack = onBack;

  const sync = () => {
    const s = st.current;
    // Ждём, пока наш шаг назад дойдёт: история меняется не сразу.
    if (s.leaving) return;
    if (s.need && !s.guarded) {
      history.pushState({ [MARK]: true }, '');
      s.guarded = true;
    } else if (!s.need && s.guarded) {
      s.guarded = false;
      s.leaving = true;
      history.back();
    }
  };

  // После перезагрузки страницы мы можем стоять на своей же старой заглушке.
  useEffect(() => {
    st.current.guarded = isOurs(history.state);
  }, []);

  useEffect(sync);

  useEffect(() => {
    const onPop = () => {
      const s = st.current;
      if (s.leaving) {
        s.leaving = false;
      } else if (s.guarded && !isOurs(history.state)) {
        s.guarded = false;
        s.onBack();
      }
      // Если после закрытия ещё есть что закрывать, заглушка вернётся.
      window.setTimeout(sync, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
