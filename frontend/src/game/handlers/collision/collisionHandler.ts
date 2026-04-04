import { isCollidableLayer } from './collisionUtils';

export function setupCollisions(scene: any, map: any, player: any): any[] {
  if (!scene || !map || !player || !Array.isArray(map.layers) || !scene.physics) {
    return [];
  }

  const collidableLayers: any[] = [];
  const sceneLayers = Array.isArray(scene.layers) ? scene.layers : [];
  const mapLayerData = Array.isArray(map.layers) ? map.layers : [];

  if (sceneLayers.length > 0) {
    sceneLayers.forEach((layer: any) => {
      if (isCollidableLayer(layer) && typeof layer.setCollisionByExclusion === 'function') {
        layer.setCollisionByExclusion([-1]);
        scene.physics.add.collider(player, layer);
        collidableLayers.push(layer);
      }
    });
    return collidableLayers;
  }

  mapLayerData.forEach((layerData: any) => {
    if (!isCollidableLayer(layerData)) {
      return;
    }

    const resolvedLayer =
      (typeof map.getLayer === 'function' && map.getLayer(layerData.name)?.tilemapLayer) ||
      (typeof map.getObjectLayer === 'function' && map.getObjectLayer(layerData.name)?.tilemapLayer);

    if (resolvedLayer && typeof resolvedLayer.setCollisionByExclusion === 'function') {
      resolvedLayer.setCollisionByExclusion([-1]);
      scene.physics.add.collider(player, resolvedLayer);
      collidableLayers.push(resolvedLayer);
    }
  });

  return collidableLayers;
}
