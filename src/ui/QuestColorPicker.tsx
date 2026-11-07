// Знамя похода: шесть готовых цветов и свой, кодом цвета или ползунками оттенка, насыщенности и яркости.
import { useRef, useState } from 'preact/hooks';
import { PRESETS, PRESET_HEX, colorName, hexToHsl, hslToHex, hueName, isHex, isPreset, parseHex, questHex, toQuestColor, type Hsl } from '../game/color';
import type { QuestColor, QuestPreset } from '../game/types';
import { QUEST_COLOR_NAME } from '../game/words';

type Choice = QuestPreset | 'none' | 'own';

const css = ({ h, s, l }: Hsl) => `hsl(${h}, ${s}%, ${l}%)`;

/**
 * Выбор знамени, как у радиокнопок: Tab попадает на выбранное, стрелки выбирают соседнее. Свой цвет
 * помнится, пока игрок пробует готовые, и возвращается, если снова выбрать «Свой цвет».
 * onChange получает null, пока в поле кода стоит не цвет: с таким знаменем поход не сохраняется.
 * label это подпись группы. С noneLabel появляется вариант без цвета, о нём сообщает onNone: так выбирается цвет встречи.
 */
export function QuestColorPicker({
  initial,
  onChange,
  label = 'Знамя',
  noneLabel,
  onNone,
}: {
  initial: QuestColor | undefined;
  onChange: (c: QuestColor | null) => void;
  label?: string;
  noneLabel?: string;
  onNone?: () => void;
}) {
  const choices: Choice[] = [...PRESETS, ...(noneLabel ? (['none'] as const) : []), 'own'];
  // Цвет, которого эта версия не знает, остаётся как был, пока игрок не выберет другой.
  const [pick, setPick] = useState<Choice | null>(isPreset(initial) ? initial : isHex(initial) ? 'own' : noneLabel && !initial ? 'none' : null);
  const [own, setOwn] = useState<string | null>(isHex(initial) ? initial.toLowerCase() : null);
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(questHex(initial ?? 'blue')));
  const [code, setCode] = useState(own?.toUpperCase() ?? '');
  const [bad, setBad] = useState(false);
  const edit = useRef<HTMLDivElement>(null);

  const applyOwn = (hex: string, next: Hsl) => {
    setOwn(hex);
    setHsl(next);
    setBad(false);
    onChange(toQuestColor(hex));
  };
  const choose = (c: Choice) => {
    setPick(c);
    if (c === 'none') {
      setBad(false);
      onNone?.();
      return;
    }
    if (c !== 'own') {
      onChange(c);
      return;
    }
    // Свой цвет начинается с того, что выбрано сейчас: так проще взять синее и сделать его темнее.
    const hex = own ?? (isPreset(pick) ? PRESET_HEX[pick] : questHex(initial ?? 'blue'));
    setCode(hex.toUpperCase());
    applyOwn(hex, own ? hsl : hexToHsl(hex));
    // На низком телефоне ползунки открываются под краем листа: лист прокручивается ровно настолько, чтобы их было видно.
    if (pick !== 'own') requestAnimationFrame(() => edit.current?.scrollIntoView({ block: 'nearest' }));
  };
  const slide = (k: keyof Hsl, v: number) => {
    const next = { ...hsl, [k]: v };
    const hex = hslToHex(next);
    setCode(hex.toUpperCase());
    applyOwn(hex, next);
  };
  // Ползунки встают по коду. Тот же код их не двигает, а у серого нет оттенка: ползунок оттенка остаётся, где был.
  const takeCode = (hex: string) => {
    if (hex === own) {
      if (bad) applyOwn(hex, hsl);
      return;
    }
    const next = hexToHsl(hex);
    applyOwn(hex, next.s === 0 ? { ...next, h: hsl.h } : next);
  };
  // Полный код берётся сразу, а короткий («#4af») по Enter или при уходе из поля: иначе на полпути к «#4af0c8» мигнёт другой цвет.
  const typeCode = (text: string) => {
    setCode(text);
    if (/^#?[0-9a-f]{6}$/i.test(text.trim())) takeCode(parseHex(text)!);
  };
  const commitCode = () => {
    const hex = parseHex(code);
    if (!hex) {
      setBad(true);
      onChange(null);
      return;
    }
    setCode(hex.toUpperCase());
    takeCode(hex);
  };

  const at = pick ? choices.indexOf(pick) : -1;
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = choices.length;
    const i = ((at < 0 ? 0 : at + step) + n) % n;
    choose(choices[i]);
    const group = (e.currentTarget as HTMLElement).closest('[role="radiogroup"]');
    requestAnimationFrame(() => group?.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus());
  };
  const radio = (c: Choice) => ({
    role: 'radio' as const,
    'aria-checked': c === pick,
    tabIndex: choices.indexOf(c) === (at < 0 ? 0 : at) ? 0 : -1,
    onClick: () => choose(c),
    onKeyDown: onKey,
    type: 'button' as const,
  });

  return (
    <div class="field">
      <div class="field-label">{label}</div>
      <div role="radiogroup" aria-label={label}>
        <div class="chips">
          {PRESETS.map((p) => (
            <button key={p} {...radio(p)} class={`swatch${p === pick ? ' is-on' : ''}`} style={{ background: PRESET_HEX[p] }} aria-label={QUEST_COLOR_NAME[p]} />
          ))}
        </div>
        <div class="qcolor-more">
          {noneLabel && (
            <button {...radio('none')} class={`qcolor-own${pick === 'none' ? ' is-on' : ''}`}>
              <span class="qcolor-own-dot qcolor-none-dot" aria-hidden="true" />
              {noneLabel}
            </button>
          )}
          <button {...radio('own')} class={`qcolor-own${pick === 'own' ? ' is-on' : ''}`}>
            <span class="qcolor-own-dot" style={own ? { background: own } : undefined} aria-hidden="true" />
            Свой цвет
            {own && (
              <>
                <span class="qcolor-own-code" aria-hidden="true">
                  {own.toUpperCase()}
                </span>
                <span class="sr-only">, {colorName(own)}</span>
              </>
            )}
          </button>
        </div>
      </div>
      {pick === 'own' && own && (
        <div class="qcolor-edit" ref={edit}>
          <label class="qcolor-row">
            <span>Код цвета</span>
            <input
              class="input qcolor-code"
              value={code}
              autocomplete="off"
              autocapitalize="characters"
              spellcheck={false}
              placeholder="#4F7BE0"
              aria-invalid={bad}
              aria-describedby={bad ? 'qcolor-error' : undefined}
              onInput={(e) => typeCode(e.currentTarget.value)}
              onBlur={commitCode}
              onKeyDown={(e) => e.key === 'Enter' && commitCode()}
            />
          </label>
          {bad && (
            <p class="note note-error" id="qcolor-error">
              Код цвета: решётка и шесть знаков из 0–9 и A–F, например #4F7BE0.
            </p>
          )}
          <Slider
            label="Оттенок"
            max={359}
            value={hsl.h}
            text={`${hueName(hsl.h)}, ${hsl.h}°`}
            track={`linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 359].map((h) => css({ ...hsl, h })).join(', ')})`}
            color={own}
            onInput={(v) => slide('h', v)}
          />
          <Slider
            label="Насыщенность"
            max={100}
            value={hsl.s}
            text={`${hsl.s}%`}
            track={`linear-gradient(to right, ${css({ ...hsl, s: 0 })}, ${css({ ...hsl, s: 100 })})`}
            color={own}
            onInput={(v) => slide('s', v)}
          />
          <Slider
            label="Яркость"
            max={100}
            value={hsl.l}
            text={`${hsl.l}%`}
            track={`linear-gradient(to right, ${css({ ...hsl, l: 0 })}, ${css({ ...hsl, l: 50 })}, ${css({ ...hsl, l: 100 })})`}
            color={own}
            onInput={(v) => slide('l', v)}
          />
        </div>
      )}
    </div>
  );
}

/** Ползунок с подсказкой на дорожке: она показывает, куда пойдёт цвет. Диктор слышит text, а не голое число. */
function Slider(p: { label: string; max: number; value: number; text: string; track: string; color: string; onInput: (v: number) => void }) {
  return (
    <label class="qcolor-row">
      <span>{p.label}</span>
      <input
        class="qslider"
        type="range"
        min={0}
        max={p.max}
        value={p.value}
        aria-valuetext={p.text}
        style={{ '--track': p.track, '--thumb': p.color }}
        onInput={(e) => p.onInput(Number(e.currentTarget.value))}
      />
    </label>
  );
}
