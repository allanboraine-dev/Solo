import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  PRESET_TONES,
  getSelectedTone,
  setSelectedTone,
  getToneVolume,
  setToneVolume,
  getCustomToneMeta,
  saveCustomToneFile,
  removeCustomTone,
  playTone,
} from '../src/utils/notificationTones.ts';
import { audioAlert } from '../src/utils/audioAlert.ts';

// Mock localStorage for Node test environment
const mockStorage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  length: 0,
  key: () => null,
};

describe('Notification & Alert Tone System Suite', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('exposes all expected built-in presets and custom option', () => {
    const presetIds = PRESET_TONES.map(p => p.id);
    assert.ok(presetIds.includes('default'), 'Default tone must be included');
    assert.ok(presetIds.includes('radar'), 'Radar tone must be included');
    assert.ok(presetIds.includes('cash'), 'Cash payday tone must be included');
    assert.ok(presetIds.includes('urgent'), 'Urgent priority tone must be included');
    assert.ok(presetIds.includes('bell'), 'Service bell tone must be included');
    assert.ok(presetIds.includes('chime_bright'), 'Bright chime tone must be included');
    assert.ok(presetIds.includes('custom'), 'Device audio custom option must be included');

    PRESET_TONES.forEach(tone => {
      assert.ok(tone.id.length > 0, 'Tone ID must be non-empty');
      assert.ok(tone.name.length > 0, 'Tone name must be non-empty');
      assert.ok(tone.description.length > 0, 'Tone description must be non-empty');
    });
  });

  it('defaults to "default" tone when no preferences are saved', () => {
    assert.strictEqual(getSelectedTone(), 'default');
  });

  it('persists and updates selected tone', () => {
    setSelectedTone('cash');
    assert.strictEqual(getSelectedTone(), 'cash');

    setSelectedTone('radar');
    assert.strictEqual(getSelectedTone(), 'radar');

    setSelectedTone('urgent');
    assert.strictEqual(getSelectedTone(), 'urgent');
  });

  it('manages alert volume with bounds clamping (0.0 to 1.0)', () => {
    assert.strictEqual(getToneVolume(), 0.85); // Default volume

    setToneVolume(0.5);
    assert.strictEqual(getToneVolume(), 0.5);

    // Clamp upper bound
    setToneVolume(1.8);
    assert.strictEqual(getToneVolume(), 1.0);

    // Clamp lower bound
    setToneVolume(-0.4);
    assert.strictEqual(getToneVolume(), 0.0);
  });

  it('validates file upload rules for device custom tones', async () => {
    // 1. Invalid non-audio file
    const fakeTextFile = {
      name: 'notes.txt',
      size: 1024,
      type: 'text/plain',
    } as unknown as File;

    const invalidResult = await saveCustomToneFile(fakeTextFile);
    assert.strictEqual(invalidResult.success, false);
    assert.ok(invalidResult.error?.includes('valid audio file'));

    // 2. Oversized file (> 10MB)
    const oversizedFile = {
      name: 'giant_recording.mp3',
      size: 15 * 1024 * 1024, // 15MB
      type: 'audio/mpeg',
    } as unknown as File;

    const oversizedResult = await saveCustomToneFile(oversizedFile);
    assert.strictEqual(oversizedResult.success, false);
    assert.ok(oversizedResult.error?.includes('under 10MB'));
  });

  it('correctly tracks and removes custom tone metadata', async () => {
    assert.strictEqual(getCustomToneMeta(), null);

    // Simulate saved custom audio metadata
    localStorage.setItem('solo_custom_tone_name', 'cape_town_chime.wav');
    localStorage.setItem('solo_custom_tone_size', '458000');
    localStorage.setItem('solo_custom_tone_mime', 'audio/wav');
    setSelectedTone('custom');

    const meta = getCustomToneMeta();
    assert.ok(meta);
    assert.strictEqual(meta?.name, 'cape_town_chime.wav');
    assert.strictEqual(meta?.size, 458000);
    assert.strictEqual(meta?.mimeType, 'audio/wav');
    assert.strictEqual(getSelectedTone(), 'custom');

    // Remove custom tone
    await removeCustomTone();
    assert.strictEqual(getCustomToneMeta(), null);
    assert.strictEqual(getSelectedTone(), 'default');
  });

  it('ensures playTone and audioAlert execute safely without crashing in SSR/Node', async () => {
    // Calling playTone in Node (without Web Audio or Audio element) should gracefully catch and not throw
    await assert.doesNotReject(async () => {
      await playTone('default');
      await playTone('radar');
      await playTone('cash');
      await playTone('urgent');
      await playTone('bell');
      await playTone('chime_bright');
    });

    assert.doesNotThrow(() => {
      audioAlert.playTripAlertChime('cash');
      audioAlert.playTripAlertChime();
    });
  });
});
