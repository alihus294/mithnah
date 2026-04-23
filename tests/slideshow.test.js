const test = require('node:test');
const assert = require('node:assert/strict');
const slideshow = require('../src/main/slideshow');

function makeDeck() {
  return {
    kind: 'dua',
    id: 'test-deck',
    title: 'Test Deck',
    slides: [
      { kind: 'title', ar: 'slide 0' },
      { kind: 'opening', ar: 'slide 1' },
      { kind: 'note', ar: 'slide 2' }
    ]
  };
}

test('initial state is inactive', () => {
  slideshow.close();
  const s = slideshow.getState();
  assert.equal(s.active, false);
  assert.equal(s.index, 0);
  assert.equal(s.blanked, false);
});

test('open() activates and resets to slide 0', () => {
  const s = slideshow.open(makeDeck());
  assert.equal(s.active, true);
  assert.equal(s.index, 0);
  assert.equal(s.deck.title, 'Test Deck');
  assert.equal(s.slides.length, 3);
});

test('next() advances, clamps at last slide', () => {
  slideshow.open(makeDeck());
  assert.equal(slideshow.next().index, 1);
  assert.equal(slideshow.next().index, 2);
  assert.equal(slideshow.next().index, 2, 'clamps at last');
  assert.equal(slideshow.next().index, 2, 'still clamps');
});

test('prev() goes back, clamps at 0', () => {
  slideshow.open(makeDeck());
  slideshow.goto(2);
  assert.equal(slideshow.prev().index, 1);
  assert.equal(slideshow.prev().index, 0);
  assert.equal(slideshow.prev().index, 0, 'clamps at 0');
});

test('first() / last() jump to ends', () => {
  slideshow.open(makeDeck());
  slideshow.goto(1);
  assert.equal(slideshow.first().index, 0);
  assert.equal(slideshow.last().index, 2);
});

test('goto() validates index, clamps out-of-range', () => {
  slideshow.open(makeDeck());
  assert.equal(slideshow.goto(99).index, 2);
  assert.equal(slideshow.goto(-5).index, 0);
  assert.throws(() => slideshow.goto('abc'), /integer/);
});

test('blank() toggles and accepts explicit on/off', () => {
  slideshow.open(makeDeck());
  assert.equal(slideshow.blank().blanked, true);
  assert.equal(slideshow.blank().blanked, false);
  assert.equal(slideshow.blank(true).blanked, true);
  assert.equal(slideshow.blank(false).blanked, false);
});

test('blank is reset when changing slide', () => {
  slideshow.open(makeDeck());
  slideshow.blank(true);
  assert.equal(slideshow.getState().blanked, true);
  slideshow.next();
  assert.equal(slideshow.getState().blanked, false, 'navigation unblanks');
});

test('close() returns state to inactive', () => {
  slideshow.open(makeDeck());
  slideshow.next();
  const s = slideshow.close();
  assert.equal(s.active, false);
  assert.equal(s.deck, null);
  assert.equal(s.slides.length, 0);
});

test('open() rejects empty or malformed deck', () => {
  assert.throws(() => slideshow.open(null), /non-empty/);
  assert.throws(() => slideshow.open({}), /non-empty/);
  assert.throws(() => slideshow.open({ slides: [] }), /non-empty/);
});

test('dispatch() is the single branch table for all inputs', () => {
  slideshow.close();
  slideshow.dispatch('OPEN', { deck: makeDeck() });
  assert.equal(slideshow.getState().index, 0);
  slideshow.dispatch('NEXT');
  assert.equal(slideshow.getState().index, 1);
  slideshow.dispatch('PREV');
  assert.equal(slideshow.getState().index, 0);
  slideshow.dispatch('LAST');
  assert.equal(slideshow.getState().index, 2);
  slideshow.dispatch('BLANK');
  assert.equal(slideshow.getState().blanked, true);
  slideshow.dispatch('CLOSE');
  assert.equal(slideshow.getState().active, false);
  assert.throws(() => slideshow.dispatch('UNKNOWN'), /Unknown/);
});

test('subscribe() fires on every state change and unsubscribe stops it', () => {
  slideshow.close();
  let calls = 0;
  const unsub = slideshow.subscribe(() => { calls++; });
  slideshow.open(makeDeck());  // +1
  slideshow.next();             // +1
  slideshow.blank();            // +1
  unsub();
  slideshow.next();             // no more calls after unsub
  assert.equal(calls, 3);
});
