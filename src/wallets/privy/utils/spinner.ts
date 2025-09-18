let spinnerInterval: NodeJS.Timeout | null = null;
let currentMessage = '';

const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function startSpinner(messageFn: () => string) {
  currentMessage = messageFn();
  let i = 0;
  
  spinnerInterval = setInterval(() => {
    process.stdout.write(`\r${spinnerChars[i]} ${currentMessage}`);
    i = (i + 1) % spinnerChars.length;
    currentMessage = messageFn();
  }, 100);
}

export function stopSpinner() {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
}
