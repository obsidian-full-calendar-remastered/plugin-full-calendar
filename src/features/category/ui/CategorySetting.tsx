/**
 * @file CategorySetting.tsx
 * @brief React component for managing category color settings.
 *
 * @description
 * This component renders a list of user-defined categories, allowing them to
 * set a color for each one, add new categories, and delete existing ones.
 *
 * @license See LICENSE.md
 */

import { useState } from 'react';
import { AutocompleteInput } from '../../../ui/components/forms/AutocompleteInput';
import { getNextColor } from '../../../ui/components/colors';

export interface CategorySetting {
  name: string;
  color: string;
}

interface CategorySettingsProps {
  settings: CategorySetting[];
  suggestions: string[]; // <-- ADD suggestions PROP
  onSave: (newSettings: CategorySetting[]) => Promise<void>;
}

export const CategorySettingsManager = ({
  settings,
  suggestions,
  onSave
}: CategorySettingsProps) => {
  const [localSettings, setLocalSettings] = useState<CategorySetting[]>(settings);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [dirty, setDirty] = useState(false);

  const handleSave = async () => {
    await onSave(localSettings);
    setDirty(false);
  };

  const addCategory = () => {
    if (newCategoryName.trim() === '' || localSettings.find(s => s.name === newCategoryName)) {
      return;
    }

    // MODIFICATION: Use getNextColor for the default
    const currentColors = localSettings.map(s => s.color);
    const newColor = getNextColor(currentColors);

    const newCategory: CategorySetting = {
      name: newCategoryName,
      color: newColor
    };

    setLocalSettings([...localSettings, newCategory]);
    setNewCategoryName('');
    setDirty(true);
  };

  const updateCategoryColor = (index: number, color: string) => {
    const newSettings = [...localSettings];
    newSettings[index].color = color;
    setLocalSettings(newSettings);
    setDirty(true);
  };

  const updateCategoryName = (index: number, name: string) => {
    const newSettings = [...localSettings];
    newSettings[index].name = name;
    setLocalSettings(newSettings);
    setDirty(true);
  };

  const deleteCategory = (index: number) => {
    const newSettings = [...localSettings];
    newSettings.splice(index, 1);
    setLocalSettings(newSettings);
    setDirty(true);
  };

  return (
    <div className="u-w-full">
      {localSettings.map((setting, index) => (
        <div className="setting-item" key={index}>
          <div className="setting-item-control u-flex-1">
            <input
              type="text"
              value={setting.name}
              onChange={e => updateCategoryName(index, e.target.value)}
              placeholder="Category Name"
            />
          </div>
          <div className="setting-item-control">
            <input
              type="color"
              value={setting.color}
              onChange={e => updateCategoryColor(index, e.target.value)}
              className="u-min-w-3rem"
            />
          </div>
          <div className="setting-item-control">
            <button onClick={() => deleteCategory(index)}>Delete</button>
          </div>
        </div>
      ))}

      {/* MODIFICATION: Use AutocompleteInput here */}
      <div className="setting-item">
        <div className="setting-item-control u-flex-1">
          <AutocompleteInput
            id="category-settings-autocomplete"
            value={newCategoryName}
            onChange={setNewCategoryName}
            suggestions={suggestions}
            placeholder="Add a new category..."
          />
        </div>
        <div className="setting-item-control">
          <button onClick={addCategory} className="mod-cta">
            Add
          </button>
        </div>
      </div>

      {dirty && (
        <div className="setting-item">
          <div className="setting-item-control">
            <button onClick={() => void handleSave()} className="mod-cta">
              Save Category Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
