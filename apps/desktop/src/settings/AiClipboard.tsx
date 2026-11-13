// Settings → AI & clipboard: which AI service the island asks by default, and the clipboard history.
import type { Settings } from '../lib/ipc';
import { call } from '../lib/ipc';
import { useTr } from '../lib/i18n';
import { saveSettings } from '../lib/store';
import { Segment, Switch } from './parts';

type Extra = Settings & { ai?: { service?: string }; clipboard?: { enabled?: boolean } };

export function AiClipboardSection({ s }: { s: Settings }) {
  const tr = useTr();
  const x = s as Extra;
  return (
    <>
      <Segment
        label={tr('Ask by default', 'Спрашивать по умолчанию')}
        value={x.ai?.service ?? 'chatgpt'}
        options={[['chatgpt', 'ChatGPT'], ['claude', 'Claude'], ['gemini', 'Gemini'], ['perplexity', 'Perplexity'], ['copilot', 'Copilot'], ['deepseek', 'DeepSeek']]}
        onChange={(service) => void saveSettings({ ai: { service } } as unknown as Partial<Settings>)}
      />
      <Switch label={tr('Keep a history of what I copy', 'Сохранять историю скопированного')} on={x.clipboard?.enabled !== false} onChange={(enabled) => void saveSettings({ clipboard: { enabled } } as unknown as Partial<Settings>)} />
      <div className="setting">
        <span className="faint small">{tr('Copies that password managers mark as private are never saved.', 'То, что менеджеры паролей помечают как личное, не сохраняется.')}</span>
        <button className="btn" onClick={() => void call('clip_clear')}>{tr('Clear history', 'Очистить историю')}</button>
      </div>
    </>
  );
}
