import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { inTauri } from './ipc';

export async function copyText(text: string) {
  if (inTauri) await writeText(text);
  else await navigator.clipboard.writeText(text);
}
