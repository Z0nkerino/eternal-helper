import { contextFor, detectLang, plural, respond, type AfinaWorld } from './engine';

function world(over: Partial<AfinaWorld> = {}) {
  const calls: string[] = [];
  const w: AfinaWorld = {
    now: new Date(2026, 10, 11, 9, 30),
    weather: null,
    place: '',
    planner: null,
    timerEndsAt: null,
    recording: false,
    actions: {
      startTimer: (m, l) => calls.push(`timer:${m}:${l}`),
      stopTimer: () => calls.push('stopTimer'),
      startRecording: () => calls.push('rec:start'),
      stopRecording: () => calls.push('rec:stop'),
      openPlanner: () => calls.push('openPlanner'),
      openTab: (t) => calls.push(`tab:${t}`),
      setDnd: (on) => calls.push(`dnd:${on}`),
    },
    ...over,
  };
  return { w, calls };
}

const planner = {
  file: 'x.json',
  exportedAt: '',
  doneToday: 2,
  tasksToday: [
    { id: '1', title: 'Write report', priority: 2, top: true, start: null },
    { id: '2', title: 'Gym', priority: 0, top: false, start: new Date(2026, 10, 11, 18, 0).getTime() },
  ],
  upcoming: [{ id: 'e', title: 'Design review', start: new Date(2026, 10, 11, 15, 0).getTime(), end: new Date(2026, 10, 11, 16, 0).getTime(), allDay: false, location: null }],
};

describe('Afina engine', () => {
  it('detects language', () => {
    expect(detectLang('Привет', 'en')).toBe('ru');
    expect(detectLang('hello', 'ru')).toBe('en');
    expect(detectLang('123', 'ru')).toBe('ru');
  });

  it('pluralises Russian', () => {
    expect(plural('ru', 1, ['a', 'b'], ['минуту', 'минуты', 'минут'])).toBe('1 минуту');
    expect(plural('ru', 3, ['a', 'b'], ['минуту', 'минуты', 'минут'])).toBe('3 минуты');
    expect(plural('ru', 11, ['a', 'b'], ['минуту', 'минуты', 'минут'])).toBe('11 минут');
  });

  it('sets timers in both languages', () => {
    const { w, calls } = world();
    expect(respond('таймер 5 минут', w, 'ru').text).toContain('5 минут');
    expect(respond('set a timer for 90 seconds', w, 'en').handled).toBe(true);
    expect(calls).toEqual(['timer:5:', 'timer:1.5:']);
  });

  it('starts and stops recording', () => {
    const { w, calls } = world();
    respond('начни запись экрана', w, 'ru');
    const busy = world({ recording: true });
    respond('stop recording', busy.w, 'en');
    expect(calls).toEqual(['rec:start']);
    expect(busy.calls).toEqual(['rec:stop']);
  });

  it('reads the Universal Planner', () => {
    const { w } = world({ planner });
    const r = respond('какие задачи на сегодня?', w, 'ru');
    expect(r.text).toContain('2 задачи');
    expect(r.text).toContain('Write report');
    expect(respond('what’s next?', w, 'en').text).toContain('Design review');
    expect(respond('what are my tasks', world().w, 'en').text).toContain('Planner');
  });

  it('does maths and fixes layout', () => {
    const { w } = world();
    expect(respond('сколько будет 2+2*2', w, 'ru').text).toBe('2+2*2 = 6');
    expect(respond('исправь раскладку: ghbdtn', w, 'ru').text).toContain('привет');
  });

  it('hands unknown questions to the model', () => {
    expect(respond('Explain quantum entanglement simply', world().w, 'en').handled).toBe(false);
  });

  it('builds a factual context', () => {
    const c = contextFor(world({ planner }).w, 'en');
    expect(c).toContain('Write report; Gym');
    expect(c).toContain('Design review');
  });
});
