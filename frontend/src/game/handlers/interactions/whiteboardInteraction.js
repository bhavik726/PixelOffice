import Phaser from 'phaser';

const INTERACTION_DISTANCE = 56;

function getObjectProperty(object, key) {
  const properties = Array.isArray(object?.properties) ? object.properties : [];
  const property = properties.find((entry) => entry?.name === key);
  return property ? String(property.value ?? '') : undefined;
}

function isWhiteboardObject(object) {
  const objectTypeProperty = getObjectProperty(object, 'type')?.toLowerCase();
  const objectType = String(object?.type ?? '').toLowerCase();
  const objectName = String(object?.name ?? '').toLowerCase();
  return objectTypeProperty === 'whiteboard' || objectType === 'whiteboard' || objectName === 'whiteboard';
}

function getWhiteboardKey(object) {
  // Prefer explicit object property id from Tiled (1,2,3...) so each board is distinct.
  const propertyId = Number(getObjectProperty(object, 'id'));
  if (Number.isFinite(propertyId) && propertyId > 0) {
    return `wb-${Math.floor(propertyId)}`;
  }

  const objectId = Number(object?.id);
  if (Number.isFinite(objectId) && objectId > 0) {
    return `wb-${Math.floor(objectId)}`;
  }

  return 'wb-default';
}

function distanceToWhiteboard(playerX, playerY, object) {
  const left = Number(object.x ?? 0);
  const top = Number(object.y ?? 0);
  const width = Number(object.width ?? 0);
  const height = Number(object.height ?? 0);

  const closestX = Math.max(left, Math.min(playerX, left + width));
  const closestY = Math.max(top, Math.min(playerY, top + height));
  return Phaser.Math.Distance.Between(playerX, playerY, closestX, closestY);
}

function findNearestWhiteboard(map, player) {
  const objectLayers = Array.isArray(map?.objects) ? map.objects : [];
  const objects = objectLayers.flatMap((layer) => (Array.isArray(layer.objects) ? layer.objects : []));

  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const playerPos = player.getPosition();

  objects
    .filter((object) => object?.visible !== false)
    .filter((object) => isWhiteboardObject(object))
    .forEach((object) => {
      const distance = distanceToWhiteboard(playerPos.x, playerPos.y, object);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = object;
      }
    });

  if (!nearest || nearestDistance > INTERACTION_DISTANCE) {
    return null;
  }

  return nearest;
}

export function setupWhiteboardInteraction(scene, map, player, wboOverlay) {
  const interactKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

  const prompt = scene.add
    .text(0, 0, '', {
      color: '#111827',
      fontSize: '16px',
      backgroundColor: '#f8fafc',
      padding: { left: 10, right: 10, top: 4, bottom: 4 },
    })
    .setVisible(false)
    .setDepth(5000)
    .setOrigin(0.5, 1);

  function showPrompt(label) {
    prompt.setText(label);
    prompt.setPosition(player.sprite.x, player.sprite.y - 42);
    prompt.setVisible(true);
  }

  function hidePrompt() {
    prompt.setVisible(false);
  }

  function update() {
    if (!player?.sprite?.active || scene?.chatInputActive || scene?.whiteboardActive) {
      hidePrompt();
      return;
    }

    const whiteboard = findNearestWhiteboard(map, player);
    if (!whiteboard) {
      hidePrompt();
      return;
    }

    const whiteboardKey = getWhiteboardKey(whiteboard);
    showPrompt('Press R to open whiteboard');
    if (Phaser.Input.Keyboard.JustDown(interactKey)) {
      const roomId = scene.room?.roomId || '';
      const boardId = roomId ? `${roomId}-${whiteboardKey}` : whiteboardKey;
      wboOverlay?.open?.(boardId);
    }
  }

  function destroy() {
    prompt.destroy();
  }

  return { update, destroy };
}