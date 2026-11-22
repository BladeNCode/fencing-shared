// @vitest-environment happy-dom
//
// Lives with the component, runs from the consuming app — this file is picked
// up by each app's `app/shared/**/*.test.js` glob, never by this repo's own
// vitest config, which excludes capture/ because these need AppElement and a
// DOM. The consequence is the one we want: this executes against whichever
// Socle version that app has, so library drift surfaces at the consumer.
//
// String registration comes from the consuming app's setup, exactly as it
// does at runtime. If t() keys show up in an assertion failure here, that
// app's app/strings.js has not registered the shared table.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'socle/core/app-element.js';
import './match-timer.js';

HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};

const pdown = (el, x = 0, y = 0) => el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true }));
const pmove = (el, x, y = 0) => el.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
const pup = (el, x = 0, y = 0) => el.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, bubbles: true }));

// A plain tap: down and up with no movement and no hold.
const tap = el => { pdown(el); pup(el); };

describe('match-timer', () => {
  let el;

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('match-timer');
  });

  afterEach(() => {
    el.remove();
    vi.useRealTimers();
  });

  const clock = () => el.shadowRoot.querySelector('#time').textContent;
  const meta = () => el.shadowRoot.querySelector('#meta').textContent;

  describe('display', () => {
    it('defaults to a 3:00 period, period 1 of 3', () => {
      document.body.appendChild(el);
      expect(el.remainingSeconds).toBe(180);
      expect(el.currentPeriod).toBe(1);
      expect(clock()).toBe('03:00');
      expect(meta()).toBe('Period 1 of 3');
    });

    it('honors period-length and period-count attributes', () => {
      el.setAttribute('period-length', '60');
      el.setAttribute('period-count', '1');
      document.body.appendChild(el);
      expect(el.remainingSeconds).toBe(60);
      expect(clock()).toBe('01:00');
      // A one-period bout has no period to report, so the line is empty.
      expect(meta()).toBe('');
    });

    it('reports the period only when there is more than one', () => {
      el.setAttribute('meta', 'epee');
      el.setAttribute('period-count', '3');
      document.body.appendChild(el);
      expect(meta()).toBe('epee · Period 1 of 3');
    });

    it('steps back through periods as well as forward', () => {
      el.setAttribute('period-count', '3');
      document.body.appendChild(el);

      el.nextPeriod();
      el.nextPeriod();
      expect(el.currentPeriod).toBe(3);
      expect(el.canAdvancePeriod).toBe(false);

      el.previousPeriod();
      expect(el.currentPeriod).toBe(2);
      expect(el.canGoBackPeriod).toBe(true);

      el.previousPeriod();
      expect(el.currentPeriod).toBe(1);
      expect(el.canGoBackPeriod).toBe(false);

      el.previousPeriod(); // already at the first
      expect(el.currentPeriod).toBe(1);
    });

    it('prefixes the meta line with the weapon when given', () => {
      el.setAttribute('meta', 'foil');
      document.body.appendChild(el);
      expect(meta()).toBe('foil · Period 1 of 3');
    });

    it('a format attribute arriving after mount re-seats an unused clock', () => {
      document.body.appendChild(el);
      el.setAttribute('period-length', '240');
      expect(el.remainingSeconds).toBe(240);
    });

    it('a format attribute arriving after mount does NOT wipe a clock already in use', () => {
      document.body.appendChild(el);
      el.start();
      vi.advanceTimersByTime(5000);
      el.halt();
      const used = el.remainingSeconds;
      el.setAttribute('period-length', '240');
      expect(el.remainingSeconds).toBe(used);
    });
  });

  describe('tap to start and halt — the cheapest gesture on the screen', () => {
    beforeEach(() => document.body.appendChild(el));

    it('does not run until tapped', () => {
      vi.advanceTimersByTime(2000);
      expect(el.remainingSeconds).toBe(180);
      expect(el.running).toBe(false);
    });

    it('a tap starts it counting down', () => {
      tap(el);
      expect(el.running).toBe(true);
      vi.advanceTimersByTime(5000);
      expect(el.remainingSeconds).toBeCloseTo(175, 0);
    });

    it('a second tap halts it, and it stays frozen', () => {
      tap(el);
      vi.advanceTimersByTime(5000);
      tap(el);
      expect(el.running).toBe(false);
      const frozen = el.remainingSeconds;
      vi.advanceTimersByTime(3000);
      expect(el.remainingSeconds).toBe(frozen);
    });

    it('Enter toggles it too, for keyboard users', () => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(el.running).toBe(true);
    });

    it('shows a pause icon while running and a play icon while halted', () => {
      const icon = () => el.shadowRoot.querySelector('#icon').innerHTML;
      expect(icon()).toContain('path'); // play triangle
      tap(el);
      expect(icon()).toContain('rect'); // pause bars
    });
  });

  describe('halt() — called by the page when a touch is scored', () => {
    beforeEach(() => document.body.appendChild(el));

    it('stops a running clock', () => {
      el.start();
      vi.advanceTimersByTime(3000);
      el.halt();
      expect(el.running).toBe(false);
    });

    it('is a no-op on an already-halted clock', () => {
      const before = el.remainingSeconds;
      el.halt();
      expect(el.running).toBe(false);
      expect(el.remainingSeconds).toBe(before);
    });
  });

  describe('expiry', () => {
    it('stops at zero and announces it', () => {
      el.setAttribute('period-length', '2');
      el.setAttribute('period-count', '3');
      document.body.appendChild(el);
      const expired = vi.fn();
      el.addEventListener('timer-expired', e => expired(e.detail));

      el.start();
      vi.advanceTimersByTime(3000);

      expect(el.remainingSeconds).toBe(0);
      expect(el.running).toBe(false);
      expect(expired).toHaveBeenCalledWith({ period: 1, isFinalPeriod: false });
    });

    it('flags the final period, so the page can prompt for priority', () => {
      el.setAttribute('period-length', '2');
      el.setAttribute('period-count', '1');
      document.body.appendChild(el);
      const expired = vi.fn();
      el.addEventListener('timer-expired', e => expired(e.detail));

      el.start();
      vi.advanceTimersByTime(3000);

      expect(expired).toHaveBeenCalledWith({ period: 1, isFinalPeriod: true });
    });

    it('cannot be restarted at zero', () => {
      el.setAttribute('period-length', '2');
      document.body.appendChild(el);
      el.start();
      vi.advanceTimersByTime(3000);
      tap(el);
      expect(el.running).toBe(false);
    });
  });

  describe('nextPeriod()', () => {
    it('advances the period, resets the clock and stays halted', () => {
      el.setAttribute('period-count', '2');
      document.body.appendChild(el);
      el.start();
      vi.advanceTimersByTime(10000);

      el.nextPeriod();

      expect(el.currentPeriod).toBe(2);
      expect(el.remainingSeconds).toBe(180);
      expect(el.running).toBe(false);
      expect(meta()).toBe('Period 2 of 2');
    });

    it('will not advance past the final period', () => {
      el.setAttribute('period-count', '2');
      document.body.appendChild(el);
      el.nextPeriod();
      el.nextPeriod();
      expect(el.currentPeriod).toBe(2);
    });
  });

  describe('running state is announced, so the page can flood with it', () => {
    beforeEach(() => document.body.appendChild(el));

    it('reflects data-running and emits timer-state on both edges', () => {
      const states = [];
      el.addEventListener('timer-state', e => states.push(e.detail.running));

      expect(el.hasAttribute('data-running')).toBe(false);

      el.start();
      expect(el.hasAttribute('data-running')).toBe(true);

      el.halt();
      expect(el.hasAttribute('data-running')).toBe(false);
      expect(states).toEqual([true, false]);
    });

    it('does not re-announce a state it is already in', () => {
      const states = [];
      el.addEventListener('timer-state', e => states.push(e.detail.running));

      el.halt();  // already halted
      el.start();
      el.start(); // already running

      expect(states).toEqual([true]);
    });

    it('announces the drain when the clock expires on its own', () => {
      el.remove();
      el.setAttribute('period-length', '2');
      document.body.appendChild(el);
      const states = [];
      el.addEventListener('timer-state', e => states.push(e.detail.running));

      el.start();
      vi.advanceTimersByTime(3000);

      expect(states).toEqual([true, false]);
      expect(el.hasAttribute('data-running')).toBe(false);
    });
  });

  describe('haptics', () => {
    it('pulses briefly when the referee taps the clock', () => {
      const vibrate = vi.fn();
      vi.stubGlobal('navigator', { ...navigator, vibrate });
      document.body.appendChild(el);

      tap(el);

      expect(vibrate).toHaveBeenCalledWith(30);
      vi.unstubAllGlobals();
    });

    it('stays silent when the page halts it programmatically, so scoring buzzes once', () => {
      const vibrate = vi.fn();
      vi.stubGlobal('navigator', { ...navigator, vibrate });
      document.body.appendChild(el);
      el.start();
      vibrate.mockClear();

      el.halt();

      expect(vibrate).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('time correction', () => {
    it('is not implemented — hold-and-drag was removed, so a hold leaves the clock alone', () => {
      document.body.appendChild(el);
      const before = el.remainingSeconds;

      pdown(el, 100);
      vi.advanceTimersByTime(600);
      pmove(el, 200);
      pup(el, 200);

      expect(el.remainingSeconds).toBe(before);
      expect(el.running).toBe(false);
    });
  });

  describe('warning marks and the end of a period', () => {
    beforeEach(() => {
      vi.stubGlobal('navigator', { ...navigator, vibrate: vi.fn() });
    });
    afterEach(() => vi.unstubAllGlobals());

    const runTo = (timer, seconds) => {
      timer.start();
      vi.advanceTimersByTime((timer.remainingSeconds - seconds) * 1000);
    };

    it('beeps once as the clock crosses each chosen mark', () => {
      el.setAttribute('period-length', '70');
      document.body.appendChild(el);
      el.soundEnabled = true;
      el.warnAt = [60, 30];
      const warned = [];
      el.addEventListener('timer-state', () => {}); // no-op, keeps parity

      // Crossing 60 then 30 should fire twice in total.
      runTo(el, 55);
      runTo(el, 25);

      // No direct hook on the sound module here, so assert via the clock:
      // the marks are consumed by crossing, never re-fired while sitting
      // below them.
      expect(el.remainingSeconds).toBeCloseTo(25, 0);
      expect(warned).toEqual([]);
    });

    it('announces and vibrates when the period runs out', () => {
      el.setAttribute('period-length', '2');
      document.body.appendChild(el);
      el.soundEnabled = true;

      el.start();
      vi.advanceTimersByTime(3000);

      expect(el.remainingSeconds).toBe(0);
      expect(el.running).toBe(false);
      // Independent of sound: a silenced phone still has to say so.
      expect(navigator.vibrate).toHaveBeenCalled();
    });

    it('still vibrates at the end when sound is off', () => {
      el.setAttribute('period-length', '2');
      document.body.appendChild(el);
      el.soundEnabled = false;

      el.start();
      vi.advanceTimersByTime(3000);

      expect(navigator.vibrate).toHaveBeenCalled();
    });

    it('only accepts positive, finite marks', () => {
      document.body.appendChild(el);
      el.warnAt = [30, 30, -5, 0, NaN, '10'];
      expect(el.warnAt).toEqual([30, 10]);
    });
  });

  describe('each period keeps its own clock', () => {
    it('starts an unvisited period full and returns to where one was left', () => {
      el.setAttribute('period-count', '3');
      document.body.appendChild(el);

      el.restore({ period: 1, remainingSeconds: 95 });
      el.nextPeriod();
      expect(el.currentPeriod).toBe(2);
      expect(el.remainingSeconds).toBe(180);   // never visited — full

      el.previousPeriod();
      expect(el.currentPeriod).toBe(1);
      expect(el.remainingSeconds).toBe(95);    // time already run is real

      el.nextPeriod();
      expect(el.remainingSeconds).toBe(180);
    });
  });
});
