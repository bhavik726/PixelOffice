export function isCollidableLayer(layer: any): boolean {
  if (!layer) {
    return false;
  }

  const properties = Array.isArray(layer.properties)
    ? layer.properties
    : Array.isArray(layer.layer?.properties)
      ? layer.layer.properties
      : [];

  if (properties.length === 0) {
    return false;
  }

  return properties.some(
    (prop: any) => prop && prop.name === 'collides' && String(prop.value) === 'true',
  );
}
