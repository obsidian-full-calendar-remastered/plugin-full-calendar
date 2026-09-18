import { computeSubmittedAlarms } from './EditEvent';

describe('computeSubmittedAlarms', () => {
  it('passes initial alarms through unchanged for providers without reminder support', () => {
    const initialAlarms = [
      { minutesBefore: 10, action: 'DISPLAY' as const },
      { minutesBefore: 1440, action: 'EMAIL' as const }
    ];

    expect(computeSubmittedAlarms(false, true, '', initialAlarms)).toEqual(initialAlarms);
  });

  it('passes initial alarms through unchanged when the field was never touched', () => {
    const initialAlarms = [
      { minutesBefore: 10, action: 'DISPLAY' as const },
      { minutesBefore: 1440, action: 'EMAIL' as const }
    ];

    expect(computeSubmittedAlarms(true, false, 10, initialAlarms)).toEqual(initialAlarms);
  });

  it('submits a single explicit alarm when the provider field was touched and has a value', () => {
    expect(computeSubmittedAlarms(true, true, 15, undefined)).toEqual([
      { minutesBefore: 15, action: 'DISPLAY' }
    ]);
  });

  it('leaves alarms unset when the field was touched, left empty, and there was nothing to clear', () => {
    expect(computeSubmittedAlarms(true, true, '', undefined)).toBeUndefined();
  });

  it('sends an explicit empty array when the field is touched and cleared but a reminder previously existed', () => {
    expect(
      computeSubmittedAlarms(true, true, '', [{ minutesBefore: 10, action: 'DISPLAY' }])
    ).toEqual([]);
  });

  it('collapses multiple prior alarms down to the single edited value, when the field is touched', () => {
    const initialAlarms = [
      { minutesBefore: 10, action: 'DISPLAY' as const },
      { minutesBefore: 1440, action: 'EMAIL' as const }
    ];

    expect(computeSubmittedAlarms(true, true, 30, initialAlarms)).toEqual([
      { minutesBefore: 30, action: 'DISPLAY' }
    ]);
  });
});
