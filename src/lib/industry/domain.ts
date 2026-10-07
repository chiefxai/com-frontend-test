export type DomainFieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'currency' | 'phone' | 'email' | 'select' | 'relation';

export interface DomainFieldDefinition {
  key: string;
  label: string;
  type: DomainFieldType;
  required?: boolean;
  options?: string[];
  relationObjectKey?: string;
}

export interface DomainObjectDefinition {
  key: string;
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  fields: DomainFieldDefinition[];
  searchable?: boolean;
  auditable?: boolean;
  primary?: boolean;
}

export interface IndustryDomainModel {
  objects: DomainObjectDefinition[];
  relationships: Array<{
    from: string;
    to: string;
    type: 'one_to_one' | 'one_to_many' | 'many_to_many';
    label?: string;
  }>;
}

export function getDomainObject(model: IndustryDomainModel, key: string) {
  return model.objects.find(object => object.key === key);
}
