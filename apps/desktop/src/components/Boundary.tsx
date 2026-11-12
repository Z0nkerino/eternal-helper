// If a tab fails to draw, show what happened (and a way to retry) instead of an empty panel.
import { Component, type ReactNode } from 'react';

export class Boundary extends Component<{ children: ReactNode; name: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(`[${this.props.name}]`, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boundary">
        <div>Something went wrong in {this.props.name}.</div>
        <code className="tiny faint">{String(this.state.error.message || this.state.error).slice(0, 300)}</code>
        <button className="chip-btn" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
