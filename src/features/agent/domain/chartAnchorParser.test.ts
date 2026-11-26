import {
  splitContentByChartAnchors,
  stripChartAnchors,
  StreamingChartAnchorFilter
} from './chartAnchorParser';

describe('chartAnchorParser', () => {
  it('splits markdown cleanly around valid [[chart:<id>]] anchors and strips unknown IDs', () => {
    const md = [
      'Here is your breakdown:',
      '',
      '[[chart:chart_1]]',
      '',
      'And an unattached reference [[chart:unknown_99]] is stripped.'
    ].join('\n');

    const segments = splitContentByChartAnchors(md, new Set(['chart_1']));
    expect(segments).toEqual([
      { type: 'markdown', text: 'Here is your breakdown:\n\n' },
      { type: 'chart', chartId: 'chart_1' },
      {
        type: 'markdown',
        text: '\n\nAnd an unattached reference  is stripped.'
      }
    ]);
    expect(stripChartAnchors('Text [[chart:chart_1]] end')).toBe('Text  end');
  });

  it('handles multiple inline chart anchors in order', () => {
    const md = 'Intro [[chart:chart_1]] Middle [[chart:chart_2]] Outro';
    const segments = splitContentByChartAnchors(md, new Set(['chart_1', 'chart_2']));
    expect(segments).toEqual([
      { type: 'markdown', text: 'Intro ' },
      { type: 'chart', chartId: 'chart_1' },
      { type: 'markdown', text: ' Middle ' },
      { type: 'chart', chartId: 'chart_2' },
      { type: 'markdown', text: ' Outro' }
    ]);
  });

  it('buffers partial [[chart:... tokens including single trailing [ during live streaming', () => {
    const filter = new StreamingChartAnchorFilter();
    expect(filter.push('Hello [')).toBe('Hello ');
    expect(filter.push('[chart:chart_1]] world')).toBe(' world');
    expect(filter.push(' more [[cha')).toBe(' more ');
    expect(filter.push('rt:chart_2]]!')).toBe('!');
    expect(filter.finish()).toBe('');
  });
});
