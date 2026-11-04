// Долгое нажатие пальцем вне полей ввода не открывает системное меню.
// CSS (user-select: none) уже не даёт выделить текст, а это закрывает
// оставшееся на Android: меню картинок и ссылок. Мышь не трогаем —
// правый клик на компьютере работает как раньше.

let lastPointer = '';

function editable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
}

export function blockTouchMenu(): void {
  addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, { capture: true, passive: true });
  addEventListener('contextmenu', (e) => {
    const type = (e as PointerEvent).pointerType || lastPointer;
    if (type === 'touch' && !editable(e.target)) e.preventDefault();
  }, { capture: true });
}
