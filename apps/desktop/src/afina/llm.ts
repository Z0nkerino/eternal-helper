// Afina's on-device brain — the same engine Afina uses in Universal Planner: WebLLM on WebGPU.
// The model downloads once (from Hugging Face), is cached, then runs fully offline. No account, no key.
import { create } from 'zustand';
import type { ChatCompletionMessageParam, MLCEngineInterface } from '@mlc-ai/web-llm';

export const MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct', label: 'Qwen 2.5 · 1.5B', size: '1.1 GB', note: ['Recommended — best balance, good Russian', 'Рекомендуется — лучший баланс, хороший русский'] },
  { id: 'Qwen2.5-0.5B-Instruct', label: 'Qwen 2.5 · 0.5B', size: '0.4 GB', note: ['Lightest — for older or low-memory computers', 'Самая лёгкая — для слабых компьютеров'] },
  { id: 'Llama-3.2-1B-Instruct', label: 'Llama 3.2 · 1B', size: '0.9 GB', note: ['Fast, English-first', 'Быстрая, лучше на английском'] },
  { id: 'Llama-3.2-3B-Instruct', label: 'Llama 3.2 · 3B', size: '2.3 GB', note: ['Smartest — needs a strong GPU', 'Самая умная — нужна мощная видеокарта'] },
] as const;

export type LlmStatus = 'checking' | 'unsupported' | 'idle' | 'downloading' | 'ready' | 'error';

interface LlmState {
  status: LlmStatus;
  progress: number;
  detail: string;
  reason?: string;
  modelId: string | null;
  installed: boolean;
}

export const useLlm = create<LlmState>(() => ({ status: 'checking', progress: 0, detail: '', modelId: null, installed: false }));

let engine: MLCEngineInterface | null = null;
let f16 = true;
let checked: Promise<boolean> | null = null;
let base = 'Qwen2.5-1.5B-Instruct';

export const modelIdFor = (b: string) => `${b}-${f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`;

export function setBaseModel(b: string) {
  base = MODELS.some((m) => m.id === b) ? b : MODELS[0].id;
}

/** Checks for WebGPU (and 16-bit float support), and whether the model is already downloaded. */
export function checkSupport() {
  checked ??= (async () => {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> } }).gpu;
    if (!gpu) {
      useLlm.setState({ status: 'unsupported', reason: 'webgpu' });
      return false;
    }
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        useLlm.setState({ status: 'unsupported', reason: 'adapter' });
        return false;
      }
      f16 = adapter.features.has('shader-f16');
    } catch {
      useLlm.setState({ status: 'unsupported', reason: 'blocked' });
      return false;
    }
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    const id = modelIdFor(base);
    useLlm.setState({ status: 'idle', installed: await hasModelInCache(id).catch(() => false), modelId: id });
    return true;
  })();
  return checked;
}

/** Downloads (first time) and loads the model. Safe to call repeatedly. */
export async function loadModel() {
  if (!(await checkSupport())) return false;
  const id = modelIdFor(base);
  if (engine && useLlm.getState().modelId === id && useLlm.getState().status === 'ready') return true;
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
  useLlm.setState({ status: 'downloading', progress: 0, detail: '', modelId: id });
  try {
    await engine?.unload();
    engine = await CreateWebWorkerMLCEngine(new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' }), id, {
      initProgressCallback: (r) => useLlm.setState({ progress: r.progress, detail: r.text }),
    });
    useLlm.setState({ status: 'ready', progress: 1, installed: true });
    return true;
  } catch (e) {
    engine = null;
    const msg = String((e as Error)?.message ?? e ?? '');
    const reason = /fetch|network|failed to load|cors|404|403/i.test(msg) ? 'network' : /memory|oom|allocation|device lost/i.test(msg) ? 'memory' : /quota|storage/i.test(msg) ? 'storage' : msg;
    useLlm.setState({ status: 'error', reason });
    return false;
  }
}

export async function removeModel() {
  const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
  await engine?.unload().catch(() => {});
  engine = null;
  for (const m of MODELS) for (const q of ['q4f16_1', 'q4f32_1']) await deleteModelAllInfoInCache(`${m.id}-${q}-MLC`).catch(() => {});
  useLlm.setState({ status: 'idle', installed: false, progress: 0 });
}

export async function switchModel(b: string) {
  setBaseModel(b);
  await engine?.unload().catch(() => {});
  engine = null;
  checked = null;
  await checkSupport();
}

export const llmReady = () => !!engine && useLlm.getState().status === 'ready';

export async function complete(messages: ChatCompletionMessageParam[], maxTokens = 450) {
  if (!engine) throw new Error('Model not loaded');
  const r = await engine.chat.completions.create({ messages, temperature: 0.5, max_tokens: maxTokens });
  return r.choices[0]?.message?.content ?? '';
}

/** Human explanation for a status reason. */
export function explainLlm(reason: string | undefined, lang: 'ru' | 'en') {
  const L = (en: string, ru: string) => (lang === 'ru' ? ru : en);
  switch (reason) {
    case 'webgpu':
    case 'adapter':
    case 'blocked':
      return L('This computer’s graphics don’t support WebGPU, so the on-device brain can’t run here. Sign in to an AI account below instead.', 'Видеокарта этого компьютера не поддерживает WebGPU, поэтому встроенный мозг здесь не запустится. Войди в ИИ-аккаунт ниже.');
    case 'network':
      return L('Couldn’t reach the model download (huggingface.co). Check your connection and try again.', 'Не удалось скачать модель (huggingface.co). Проверь интернет и попробуй ещё раз.');
    case 'memory':
      return L('Not enough graphics memory. Try the smaller Qwen 2.5 · 0.5B.', 'Не хватает видеопамяти. Попробуй модель поменьше — Qwen 2.5 · 0.5B.');
    case 'storage':
      return L('Not enough free disk space for the model.', 'Не хватает места на диске для модели.');
    default:
      return reason ?? '';
  }
}
