// Top-level React error boundary. A render-time throw in any child (bad
// hook call, undefined property access, etc.) would otherwise propagate
// all the way up and cause react-dom to unmount the entire tree —
// including every document-level keyboard listener. Operators would see
// the clock stop, F3/F4/F5 stop responding, and no way to recover short
// of restarting the app.
//
// This boundary catches those throws, logs them to the console for
// diagnosis, and keeps the rest of the app running. Each overlay mounts
// its own boundary (see App.jsx) so a crash in SettingsOverlay doesn't
// hide the Dashboard — only the failing subtree gets replaced with a
// minimal error marker the operator can dismiss.

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary${this.props.name ? ':' + this.props.name : ''}]`, error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      // Fallback is intentionally tiny and dismissable — the goal is to
      // keep sibling components alive, not to apologize verbosely.
      return (
        <div
          className="error-boundary-toast"
          onClick={this.reset}
          title={String(this.state.error?.stack || this.state.error)}
        >
          خلل في «{this.props.name || 'مكوّن'}» — انقر للإخفاء
          <div className="error-boundary-toast__msg">
            {String(this.state.error?.message || this.state.error).slice(0, 140)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
