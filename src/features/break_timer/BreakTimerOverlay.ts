/**
 * @file BreakTimerOverlay.ts
 * @brief Handles creation, animation, and destruction of the break timer fullscreen overlay.
 * @license See LICENSE.md
 */

export function showBreakTimerOverlay(durationSecs: number, onClose: () => void): () => void {
  const doc = activeDocument;

  // Create overlay container
  const overlay = doc.createElement('div');
  overlay.className = 'ofc-break-timer-overlay';

  // Create card
  const card = doc.createElement('div');
  card.className = 'ofc-break-timer-card';
  overlay.appendChild(card);

  // Title
  const title = doc.createElement('h2');
  title.className = 'ofc-break-timer-title';
  title.innerText = 'Time to take a break!';
  card.appendChild(title);

  // Subtitle/Description
  const desc = doc.createElement('p');
  desc.className = 'ofc-break-timer-desc';
  desc.innerText = 'Rest your eyes, stand up, and stretch a bit.';
  card.appendChild(desc);

  // Animated ASCII Cat Container
  const catContainer = doc.createElement('div');
  catContainer.className = 'ofc-break-timer-cat-container';
  card.appendChild(catContainer);

  const catPre = doc.createElement('pre');
  catPre.className = 'ofc-break-timer-cat';
  catContainer.appendChild(catPre);

  // 4 Walk frames
  const catFrames = [
    // Frame 0
    `  /\\_/\\_____
 ( o.o )    )
  > ^ <    / 
  | |  | |`,
    // Frame 1
    `  /\\_/\\_____
 ( =.= )    )
  > ^ <    / 
  / /  / /`,
    // Frame 2
    `  /\\_/\\_____  ~
 ( o.o )   )/
  > ^ <   /  
  | |  | |`,
    // Frame 3
    `  /\\_/\\_____
 ( =.= )    )
  > ^ <    / 
  \\ \\  \\ \\`
  ];

  let frameIdx = 0;
  catPre.textContent = catFrames[frameIdx];
  const frameInterval = window.setInterval(() => {
    frameIdx = (frameIdx + 1) % catFrames.length;
    catPre.textContent = catFrames[frameIdx];
  }, 250);

  // Progress bar wrapper
  const progressWrapper = doc.createElement('div');
  progressWrapper.className = 'ofc-break-timer-progress-wrapper';
  card.appendChild(progressWrapper);

  const progressBar = doc.createElement('div');
  progressBar.className = 'ofc-break-timer-progress-bar';
  progressWrapper.appendChild(progressBar);

  // Countdown text
  const countdown = doc.createElement('div');
  countdown.className = 'ofc-break-timer-countdown';
  card.appendChild(countdown);

  let secondsLeft = durationSecs;
  const updateCountdown = () => {
    countdown.innerText = `Resuming in ${secondsLeft} second${secondsLeft === 1 ? '' : 's'}...`;
    progressBar.style.width = `${(secondsLeft / durationSecs) * 100}%`;
  };
  updateCountdown();

  // Timer interval for countdown
  const countdownInterval = window.setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) {
      cleanup();
      onClose();
    } else {
      updateCountdown();
    }
  }, 1000);

  // Close / Skip Button
  const button = doc.createElement('button');
  button.className = 'ofc-break-timer-close-btn';
  button.innerText = 'Skip break';
  card.appendChild(button);

  const cleanup = () => {
    window.clearInterval(frameInterval);
    window.clearInterval(countdownInterval);
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  button.addEventListener('click', () => {
    cleanup();
    onClose();
  });

  doc.body.appendChild(overlay);

  return cleanup;
}
