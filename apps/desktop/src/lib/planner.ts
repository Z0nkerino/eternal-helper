// Keeps the island's view of Universal Planner fresh: on start, every 5 minutes, and whenever the
// Planner sends a live event (which usually means a new backup is on its way too).
import { call, listen, type PlannerEvent } from './ipc';
import { toast, useApp } from './store';

let flashTimer: ReturnType<typeof setTimeout> | undefined;

export async function refreshPlanner(manual = false) {
  try {
    const snap = await call('planner_snapshot');
    useApp.setState({ planner: snap, plannerError: null });
  } catch (e) {
    useApp.setState({ planner: null, plannerError: String(e) });
    if (manual && String(e) !== 'no-folder') toast(String(e), { tone: 'warn', force: true });
  }
}

export function startPlannerSync() {
  void refreshPlanner();
  const timer = setInterval(() => void refreshPlanner(), 5 * 60_000);
  const off = listen<PlannerEvent>('planner://event', (ev) => {
    // Show it in the pill for a few seconds as a live activity.
    useApp.setState({ plannerFlash: ev });
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => useApp.setState({ plannerFlash: null }), 6000);
    // The backup connector writes daily; refresh in case it already has today's change.
    setTimeout(() => void refreshPlanner(), 1500);
  });
  return () => {
    clearInterval(timer);
    off();
  };
}
