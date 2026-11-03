// Кнопка «Назад» телефона (и браузера). На каждый уровень, который можно закрыть, в истории
// браузера лежит своя запись-заглушка: одна за раздел не «Лагерь», ещё одна за открытый лист
// или знакомство. «Назад» снимает верхнюю, и вместо выхода из приложения мы закрываем то,
// что открыто сверху. Когда закрывать нечего, заглушек нет, и «Назад» работает как обычно.
//
// Заглушки кладутся только после того, как человек хоть раз коснулся страницы: Chrome на
// Android пропускает при «Назад» записи, добавленные без касания, и приложение бы закрылось.
// По той же причине заглушка раздела не снимается вместе с листом, а остаётся на месте.
import { useEffect, useRef } from 'preact/hooks';

const MARK = 'lagerBack';

/** Сколько наших заглушек под этой записью истории. */
const depthOf = (state: unknown): number => {
  const n = state && typeof state === 'object' ? (state as Record<string, unknown>)[MARK] : undefined;
  return typeof n === 'number' && n > 0 ? n : 0;
};

/** Человек уже касался страницы. Где браузер этого не сообщает, считаем, что касался. */
const touched = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;

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
 * Держать в истории столько заглушек, сколько уровней можно закрыть (levels), и звать onBack,
 * когда верхнюю сняли кнопкой «Назад». Если уровень закрыли кнопкой на экране, лишние заглушки
 * убираем сами, чтобы следующее «Назад» не пропадало впустую.
 */
export function useBackButton(levels: number, onBack: () => void): void {
  const st = useRef({ depth: 0, leaving: false, levels, onBack });
  st.current.levels = levels;
  st.current.onBack = onBack;

  const sync = () => {
    const s = st.current;
    // Ждём, пока наш шаг назад дойдёт: история меняется не сразу.
    if (s.leaving) return;
    if (s.levels > s.depth) {
      if (!touched()) return;
      while (s.depth < s.levels) {
        s.depth += 1;
        history.pushState({ [MARK]: s.depth }, '');
      }
    } else if (s.levels < s.depth) {
      const drop = s.depth - s.levels;
      s.leaving = true;
      history.go(-drop);
    }
  };

  useEffect(() => {
    // После перезагрузки страницы мы можем стоять на своих же старых заглушках.
    st.current.depth = depthOf(history.state);
    const onPop = () => {
      const s = st.current;
      const was = s.depth;
      s.depth = depthOf(history.state);
      if (s.leaving) s.leaving = false;
      else if (s.depth < was) s.onBack();
      // Если что-то не сошлось, заглушки выровняются.
      window.setTimeout(sync, 0);
    };
    // Первое касание: теперь заглушки можно класть.
    const onTouch = () => window.setTimeout(sync, 0);
    window.addEventListener('popstate', onPop);
    window.addEventListener('click', onTouch, true);
    window.addEventListener('keydown', onTouch, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('click', onTouch, true);
      window.removeEventListener('keydown', onTouch, true);
    };
  }, []);

  useEffect(sync);
}
