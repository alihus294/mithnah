import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import SlideshowOverlay from './components/SlideshowOverlay.jsx';
import FloatingMenu from './components/FloatingMenu.jsx';
import UpdateBadge from './components/UpdateBadge.jsx';
import HelpOverlay from './components/HelpOverlay.jsx';
import SettingsOverlay from './components/SettingsOverlay.jsx';
import DuaPicker from './components/DuaPicker.jsx';
import PrayerTracker from './components/PrayerTracker.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import OnboardingOverlay from './components/OnboardingOverlay.jsx';
import FirstRunTour from './components/FirstRunTour.jsx';
import UndoToast from './components/UndoToast.jsx';
import { onSlideshowState } from './lib/ipc.js';

// Each overlay gets its own ErrorBoundary so a crash inside one (e.g. a
// bad hook call in SettingsOverlay) doesn't take down the Dashboard or
// the other overlays' keyboard listeners. Before this wrapping, a single
// render error would unmount the whole tree and leave the operator with
// a frozen clock and no way back into F3.
export default function App() {
  const [slideshow, setSlideshow] = useState(null);

  useEffect(() => {
    const unsubscribe = onSlideshowState((state) => setSlideshow(state));
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  return (
    <div className="app-root" dir="rtl">
      <ErrorBoundary name="Dashboard"><Dashboard /></ErrorBoundary>
      <ErrorBoundary name="FloatingMenu"><FloatingMenu /></ErrorBoundary>
      <ErrorBoundary name="HelpOverlay"><HelpOverlay /></ErrorBoundary>
      <ErrorBoundary name="SettingsOverlay"><SettingsOverlay /></ErrorBoundary>
      <ErrorBoundary name="DuaPicker"><DuaPicker /></ErrorBoundary>
      <ErrorBoundary name="PrayerTracker"><PrayerTracker /></ErrorBoundary>
      <ErrorBoundary name="SlideshowOverlay"><SlideshowOverlay state={slideshow} /></ErrorBoundary>
      <ErrorBoundary name="OnboardingOverlay"><OnboardingOverlay /></ErrorBoundary>
      <ErrorBoundary name="UndoToast"><UndoToast /></ErrorBoundary>
      <ErrorBoundary name="FirstRunTour"><FirstRunTour /></ErrorBoundary>
      <ErrorBoundary name="UpdateBadge"><UpdateBadge /></ErrorBoundary>
    </div>
  );
}
