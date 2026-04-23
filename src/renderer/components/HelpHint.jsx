// Floating "؟" hint bottom-right. Dispatches F1 on click so HelpOverlay opens.

export default function HelpHint() {
  const open = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
  };
  return (
    <button
      className="help-hint"
      type="button"
      aria-label="فتح المساعدة (F1)"
      title="المساعدة · F1"
      onClick={open}
    >
      <span aria-hidden="true">؟</span>
    </button>
  );
}
