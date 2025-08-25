export function stripMetaFields(schemaDefinition) {
  if (Array.isArray(schemaDefinition)) {
    return schemaDefinition.map(stripMetaFields);
  }

  if (typeof schemaDefinition !== "object" || schemaDefinition === null) {
    return schemaDefinition;
  }

  const cleaned = {};
  for (const key in schemaDefinition) {
    if (key === "meta") continue;

    if (typeof schemaDefinition[key] === "object") {
      cleaned[key] = stripMetaFields(schemaDefinition[key]);
    } else {
      cleaned[key] = schemaDefinition[key];
    }
  }

  return cleaned;
}
