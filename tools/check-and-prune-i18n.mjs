import fs from 'fs';
import path from 'path';

const localesDir = path.join('src', 'features', 'i18n', 'locales');
const enPath = path.join(localesDir, 'en.json');
let enJson = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Flatten json keys to dotted paths to check for unused keys
function flattenObject(ob) {
  var toReturn = {};
  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;

    if ((typeof ob[i]) == 'object' && ob[i] !== null) {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;
        toReturn[i + '.' + x] = flatObject[x];
      }
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

const flatKeys = Object.keys(flattenObject(enJson));
const keySet = new Set(flatKeys);

// Find all ts/tsx files
function getFiles(dir, files_) {
  files_ = files_ || [];
  const files = fs.readdirSync(dir);
  for (const i in files) {
    const name = dir + '/' + files[i];
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files_);
    } else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.test.ts') && !name.endsWith('i18n.ts')) {
      files_.push(name);
    }
  }
  return files_;
}

const allFiles = getFiles(path.join('src'));

const regex = /\bt\((['"`])([^'"`]+)\1[^\)]*\)/g;
const dynamicKeyPropertyRegex =
  /\b(?:titleKey|descriptionKey|targetKey|i18nKey|translationKey)\s*:\s*(['"`])([^'"`]+)\1/g;
const foundKeys = new Set();
const missingKeys = [];

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = regex.exec(content)) !== null) {
    const key = m[2];
    foundKeys.add(key);
    if (!keySet.has(key)) {
      missingKeys.push({ file, key });
    }
  }

  // Detect statically-declared dynamic key mappings used later via t(variable).
  // This keeps pruning strict while supporting patterns like milestone definitions.
  while ((m = dynamicKeyPropertyRegex.exec(content)) !== null) {
    const key = m[2];
    foundKeys.add(key);
    if (!keySet.has(key)) {
      missingKeys.push({ file, key });
    }
  }
});

const unusedKeys = flatKeys.filter(k => !foundKeys.has(k) && !k.includes('{{') && !k.match(/weekdays\.|ordinal\./));

function pruneObject(ob, keysToRemoveSet, currentPath = '') {
  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;
    const keyPath = currentPath ? `${currentPath}.${i}` : i;
    if ((typeof ob[i]) == 'object' && ob[i] !== null) {
      pruneObject(ob[i], keysToRemoveSet, keyPath);
      if (Object.keys(ob[i]).length === 0) {
        delete ob[i];
      }
    } else {
      if (keysToRemoveSet.has(keyPath)) {
        delete ob[i];
      }
    }
  }
}

let hasErrors = false;

if (missingKeys.length > 0) {
  console.error('❌ Missing Keys in en.json:');
  missingKeys.forEach(m => console.error(`  - ${m.key} (used in ${m.file})`));
  fs.writeFileSync('missing.json', JSON.stringify(missingKeys, null, 2), 'utf8');
  hasErrors = true;
}

if (unusedKeys.length > 0) {
  console.log(`\n🗑️ Found ${unusedKeys.length} unused keys. Pruning from en.json...`);
  const keysToRemoveSet = new Set(unusedKeys);
  pruneObject(enJson, keysToRemoveSet);
  fs.writeFileSync(enPath, JSON.stringify(enJson, null, 2) + '\n', 'utf8');
  console.log('✅ Pruned unused keys and safely updated en.json.');
  hasErrors = true;
} else {
  console.log('✅ No unused keys found in en.json.');
}

// Now sync all other locale files with en.json
function syncObjects(template, target) {
  let modified = false;
  // Remove keys not in template
  for (const key in target) {
    if (!target.hasOwnProperty(key)) continue;
    if (!template.hasOwnProperty(key)) {
      delete target[key];
      modified = true;
    }
  }
  // Add missing keys or sync structure
  for (const key in template) {
    if (!template.hasOwnProperty(key)) continue;
    if (typeof template[key] === 'object' && template[key] !== null) {
      if (typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
        modified = true;
      }
      if (syncObjects(template[key], target[key])) {
        modified = true;
      }
    } else {
      // Missing key
      if (!target.hasOwnProperty(key)) {
        target[key] = template[key];
        modified = true;
      }
      // Bad type (was object instead of string)
      else if (typeof target[key] === 'object') {
        target[key] = template[key];
        modified = true;
      }
    }
  }
  return modified;
}

const localeFiles = fs.readdirSync(localesDir).filter(f => f.endsWith('.json') && f !== 'en.json');

console.log(`\n🔄 Syncing other locales with en.json...`);
for (const localeFile of localeFiles) {
  const filePath = path.join(localesDir, localeFile);
  let langJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const wasModified = syncObjects(enJson, langJson);
  if (wasModified) {
    fs.writeFileSync(filePath, JSON.stringify(langJson, null, 2) + '\n', 'utf8');
    console.log(`✅ Synced ${localeFile} with en.json`);
    hasErrors = true; // Signal that a file was modified so git commit is needed
  } else {
    console.log(`✅ ${localeFile} is already in sync with en.json`);
  }
}

// --- NLP payloads synchronization logic ---

const nlpDir = path.join('src', 'features', 'nlp', 'payloads');
const nlpEnPath = path.join(nlpDir, 'en.json');
const nlpEnJson = JSON.parse(fs.readFileSync(nlpEnPath, 'utf8'));

// Specialized sync function for NLP objects to preserve regex/flags and custom rules
function syncNlpObjects(template, target, targetLocale) {
  let modified = false;

  // 1. Sync version
  if (target.version !== template.version) {
    target.version = template.version;
    modified = true;
  }

  // 2. Sync locale
  if (target.locale !== targetLocale) {
    target.locale = targetLocale;
    modified = true;
  }

  // 3. Sync categoryParsing
  if (!target.categoryParsing) {
    target.categoryParsing = {};
    modified = true;
  }
  if (syncObjects(template.categoryParsing, target.categoryParsing)) {
    modified = true;
  }

  // 4. Sync rules array
  if (!target.rules) {
    target.rules = [];
    modified = true;
  }

  const templateRuleNames = new Set(template.rules.map(r => r.name));
  const targetOnlyRules = target.rules.filter(r => !templateRuleNames.has(r.name));

  const finalRules = [];
  for (const tempRule of template.rules) {
    const tRule = target.rules.find(r => r.name === tempRule.name);
    if (tRule) {
      const merged = { ...tempRule };
      if (tRule.hasOwnProperty('regex')) merged.regex = tRule.regex;
      if (tRule.hasOwnProperty('flags')) merged.flags = tRule.flags;
      // actions are logic/intent properties, so copy directly from template
      if (tempRule.hasOwnProperty('actions')) {
        merged.actions = [...tempRule.actions];
      }
      finalRules.push(merged);
    } else {
      finalRules.push({ ...tempRule });
    }
  }

  // Preserve target-only rules in their relative original positions
  for (const targetOnlyRule of targetOnlyRules) {
    const origIdx = target.rules.findIndex(r => r.name === targetOnlyRule.name);
    let nextTemplateRuleName = null;
    for (let i = origIdx + 1; i < target.rules.length; i++) {
      if (templateRuleNames.has(target.rules[i].name)) {
        nextTemplateRuleName = target.rules[i].name;
        break;
      }
    }
    
    if (nextTemplateRuleName) {
      const insertIdx = finalRules.findIndex(r => r.name === nextTemplateRuleName);
      if (insertIdx !== -1) {
        finalRules.splice(insertIdx, 0, targetOnlyRule);
        continue;
      }
    }
    finalRules.push(targetOnlyRule);
  }

  if (JSON.stringify(target.rules) !== JSON.stringify(finalRules)) {
    target.rules = finalRules;
    modified = true;
  }

  return modified;
}

console.log(`\n🔄 Syncing and checking NLP payloads...`);
const allLocales = fs.readdirSync(localesDir)
  .filter(f => f.endsWith('.json'))
  .map(f => path.basename(f, '.json')); // e.g. ["de", "en", "es", "fr", "it", "zh"]

for (const lang of allLocales) {
  if (lang === 'en') continue;

  const nlpFilePath = path.join(nlpDir, `${lang}.json`);
  let nlpJson;
  let wasModified = false;

  if (!fs.existsSync(nlpFilePath)) {
    console.log(`🆕 NLP payload for '${lang}' does not exist. Creating from en.json...`);
    nlpJson = JSON.parse(JSON.stringify(nlpEnJson));
    nlpJson.locale = lang;
    fs.writeFileSync(nlpFilePath, JSON.stringify(nlpJson, null, 2) + '\n', 'utf8');
    console.log(`✅ Created ${lang}.json in NLP payloads`);
    wasModified = true;
    hasErrors = true;
  } else {
    nlpJson = JSON.parse(fs.readFileSync(nlpFilePath, 'utf8'));
    wasModified = syncNlpObjects(nlpEnJson, nlpJson, lang);
    if (wasModified) {
      fs.writeFileSync(nlpFilePath, JSON.stringify(nlpJson, null, 2) + '\n', 'utf8');
      console.log(`✅ Synced ${lang}.json in NLP payloads with en.json`);
      hasErrors = true;
    } else {
      console.log(`✅ NLP payload for '${lang}' is already in sync`);
    }
  }
}

if (hasErrors) {
  if (missingKeys.length > 0) {
    console.error('\n🚨 Run failed due to missing i18n keys.');
    process.exit(1);
  } else {
    console.warn('\n⚠️ Run "failed" because i18n files were modified (pruned/synced). Please review and commit the changes.');
    process.exit(1);
  }
}

console.log('\n✅ All i18n checks passed and files are perfectly synced.');
process.exit(0);
