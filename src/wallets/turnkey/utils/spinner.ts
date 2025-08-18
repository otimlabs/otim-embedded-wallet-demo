// Spinner helpers for terminal output
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let activeSpinner: ReturnType<typeof setInterval> | null = null;
let activeSpinnerIndex = 0;

export function startSpinner(getText: () => string, intervalMs = 100) {
  stopSpinner();
  activeSpinnerIndex = 0;
  activeSpinner = setInterval(() => {
    const frame = SPINNER_FRAMES[activeSpinnerIndex];
    const text = getText();
    process.stdout.write(`\r${frame} ${text}`);
    activeSpinnerIndex = (activeSpinnerIndex + 1) % SPINNER_FRAMES.length;
  }, intervalMs);
}

export function stopSpinner() {
  if (activeSpinner) {
    clearInterval(activeSpinner);
    activeSpinner = null;
    process.stdout.write('\r');
  }
}
