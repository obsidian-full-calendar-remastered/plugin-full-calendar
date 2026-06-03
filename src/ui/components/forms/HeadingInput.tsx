// src/ui/components/forms/HeadingInput.tsx

import { TextInput } from './TextInput';

interface HeadingInputProps {
  value: string;
  onChange: (value: string) => void;
  headings: string[];
  readOnly?: boolean;
}

export function HeadingInput({ value, onChange, headings, readOnly }: HeadingInputProps) {
  if (readOnly) {
    return (
      <div className="ofc-heading-setting-control">
        <span>Under heading</span>
        <TextInput value={value || ''} onChange={() => {}} readOnly={true} />
        <span className="ofc-heading-setting-suffix">in daily notes</span>
      </div>
    );
  }

  if (headings.length > 0) {
    return (
      <select required value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="" disabled hidden>
          Choose a heading
        </option>
        {headings.map((o, idx) => (
          <option key={idx} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  return <TextInput value={value || ''} onChange={onChange} placeholder="Enter heading name" />;
}
