import type { IndustryProfile } from './types';

export interface IndustryValidationError {
  path: string;
  message: string;
}

export function validateIndustryProfile(profile: IndustryProfile): IndustryValidationError[] {
  const errors: IndustryValidationError[] = [];
  const objectKeys = new Set(profile.domainModel?.objects.map(o => o.key) ?? []);

  if (!profile.key) errors.push({ path: 'key', message: 'Industry key is required.' });
  if (!profile.label) errors.push({ path: 'label', message: 'Industry label is required.' });
  if (!profile.pipeline?.key) errors.push({ path: 'pipeline.key', message: 'Pipeline key is required.' });

  for (const stage of profile.pipeline?.stages ?? []) {
    if (!stage.key || !stage.label) {
      errors.push({ path: `pipeline.stages.${stage.order}`, message: 'Every pipeline stage needs a key and label.' });
    }
  }

  for (const object of profile.domainModel?.objects ?? []) {
    if (!object.key || !object.label || !object.pluralLabel) {
      errors.push({ path: `domainModel.objects.${object.key || 'unknown'}`, message: 'Every domain object needs key, label and pluralLabel.' });
    }
    for (const field of object.fields) {
      if (!field.key || !field.label || !field.type) {
        errors.push({ path: `domainModel.objects.${object.key}.fields`, message: 'Every field needs key, label and type.' });
      }
      if (field.relationObjectKey && !objectKeys.has(field.relationObjectKey)) {
        errors.push({
          path: `domainModel.objects.${object.key}.fields.${field.key}`,
          message: `Relation target "${field.relationObjectKey}" does not exist.`,
        });
      }
    }
  }

  for (const relationship of profile.domainModel?.relationships ?? []) {
    if (!objectKeys.has(relationship.from)) {
      errors.push({ path: 'domainModel.relationships', message: `Unknown source object "${relationship.from}".` });
    }
    if (!objectKeys.has(relationship.to)) {
      errors.push({ path: 'domainModel.relationships', message: `Unknown target object "${relationship.to}".` });
    }
  }

  return errors;
}
