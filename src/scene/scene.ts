// Карта лагеря: картинки и места. camp.json пишет скрипт scripts/render-camp.
import camp from './camp.json';
import type { Light } from '../game/time';

export interface Sprite {
  file: string;
  /** Прямоугольник фигуры в пикселях полной картинки. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Снято уже при ночном свете, ночной фильтр к ней не нужен. */
  lit?: boolean;
  /** Макушка фигуры: над ней встаёт номер задачи. */
  head?: [number, number];
  /** Плащ героя отдельным белым слоем: его красят в цвет похода и кладут поверх фигуры, см. ui/tint.ts. */
  cape?: Layer;
}

/** Часть картинки фигуры: файл и его прямоугольник в пикселях полной картинки. */
export interface Layer {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CampManifest {
  /** Меняется при каждой съёмке сцены, чтобы новые картинки не застревали в кэше. */
  version?: string;
  size: [number, number];
  fire: [number, number];
  chest: [number, number];
  messenger: [number, number];
  backgrounds: Partial<Record<Light, string>>;
  /** Части фона, которые рисуются поверх фигур за ними: костёр по свету, fire/day и т. п. */
  layers?: Record<string, Sprite>;
  spots: Record<string, [number, number]>;
  sprites: Record<string, Sprite>;
}

export const SCENE = camp as unknown as CampManifest;
export const [SCENE_W, SCENE_H] = SCENE.size;

export function spriteKey(spot: string, who: string, pose: string): string {
  return `${spot}/${who}/${pose}`;
}

/** Буквы обликов героя в именах картинок: «rogue», «rogue-b» … «rogue-e». */
const LOOK_SUFFIX = ['', '-b', '-c', '-d', '-e'];

/** Картинка героя в его облике. Если такой облик не снят, берётся первый. */
export function heroKey(spot: string, cls: string, look: number, pose: string): string {
  const key = spriteKey(spot, `${cls}${LOOK_SUFFIX[look] ?? ''}`, pose);
  return SCENE.sprites[key] ? key : spriteKey(spot, cls, pose);
}

export function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}camp/${file}${SCENE.version ? `?v=${SCENE.version}` : ''}`;
}

export function pct(v: number, of: number): string {
  return `${((v / of) * 100).toFixed(3)}%`;
}
