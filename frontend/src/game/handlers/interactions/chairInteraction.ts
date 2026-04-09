import Phaser from 'phaser';

type Direction = 'up' | 'down' | 'left' | 'right';

type ChairArea = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  sitX?: number;
  sitY?: number;
  sitDirection?: Direction;
};

type ChairController = {
  update: () => void;
  destroy: () => void;
};

const INTERACTION_DISTANCE = 24;
const LEAVE_OFFSET = 24;

function getObjectProperty(object: any, key: string): string | undefined {
  const properties = Array.isArray(object?.properties) ? object.properties : [];
  const prop = properties.find((entry: any) => entry?.name === key);
  if (!prop) {
    return undefined;
  }
  return String(prop.value ?? '');
}

function getObjectNumericProperty(object: any, key: string): number | undefined {
  const rawValue = getObjectProperty(object, key);
  if (rawValue === undefined) {
    return undefined;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function parseDirection(value: string | undefined): Direction | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (
    normalized !== 'up' &&
    normalized !== 'down' &&
    normalized !== 'left' &&
    normalized !== 'right'
  ) {
    return undefined;
  }

  return normalized;
}

function isChairObject(object: any): boolean {
  const type = getObjectProperty(object, 'type')?.toLowerCase();
  const objectName = String(object?.name ?? '').toLowerCase();
  return type === 'chair' || objectName === 'chair';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function distanceToChair(playerX: number, playerY: number, chair: ChairArea): number {
  const closestX = clamp(playerX, chair.x, chair.x + chair.width);
  const closestY = clamp(playerY, chair.y, chair.y + chair.height);
  return Phaser.Math.Distance.Between(playerX, playerY, closestX, closestY);
}

function resolveSitDirection(playerX: number, playerY: number, chair: ChairArea): Direction {
  const centerX = chair.x + chair.width / 2;
  const centerY = chair.y + chair.height / 2;

  const dx = playerX - centerX;
  const dy = playerY - centerY;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'left' : 'right';
  }

  return dy > 0 ? 'up' : 'down';
}

function resolveSitPosition(chair: ChairArea, direction: Direction): { x: number; y: number } {
  const centerX = chair.x + chair.width / 2;
  const centerY = chair.y + chair.height / 2;

  if (direction === 'up') {
    return { x: centerX, y: chair.y + chair.height + 2 };
  }
  if (direction === 'down') {
    return { x: centerX, y: chair.y + 2 };
  }
  if (direction === 'left') {
    return { x: chair.x + chair.width + 2, y: centerY };
  }

  return { x: chair.x + 2, y: centerY };
}

function resolveLeavePosition(
  seatX: number,
  seatY: number,
  direction: Direction,
): { x: number; y: number } {
  if (direction === 'up') {
    return { x: seatX, y: seatY + LEAVE_OFFSET };
  }
  if (direction === 'down') {
    return { x: seatX, y: seatY - LEAVE_OFFSET };
  }
  if (direction === 'left') {
    return { x: seatX + LEAVE_OFFSET, y: seatY };
  }

  return { x: seatX - LEAVE_OFFSET, y: seatY };
}

export function setupChairInteraction(scene: any, map: any, player: any): ChairController {
  const objectLayer = map?.getObjectLayer?.('interactions');
  const objects = Array.isArray(objectLayer?.objects) ? objectLayer.objects : [];
  const tileWidth = Number(map?.tileWidth) || 32;
  const tileHeight = Number(map?.tileHeight) || 32;

  const chairs: ChairArea[] = objects
    .filter((object: any) => object?.visible !== false)
    .filter((object: any) => isChairObject(object))
    .map((object: any) => {
      const sitXTile = getObjectNumericProperty(object, 'sitx');
      const sitYTile = getObjectNumericProperty(object, 'sity');
      const sitDirection = parseDirection(getObjectProperty(object, 'direction'));

      return {
        id: Number(object.id ?? 0),
        x: Number(object.x ?? 0),
        y: Number(object.y ?? 0),
        width: Number(object.width ?? 0),
        height: Number(object.height ?? 0),
        // sitx/sity are map grid coordinates where (0,0) is top-left tile.
        sitX: sitXTile === undefined ? undefined : sitXTile * tileWidth + tileWidth / 2,
        sitY: sitYTile === undefined ? undefined : (sitYTile + 1) * tileHeight,
        sitDirection,
      };
    })
    .filter((chair: ChairArea) => chair.width > 0 && chair.height > 0);

  const interactKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

  const prompt = scene.add
    .text(0, 0, '', {
      color: '#111827',
      fontFamily: 'VT323, monospace',
      fontSize: '18px',
      backgroundColor: '#f8fafc',
      padding: { left: 8, right: 8, top: 3, bottom: 3 },
    })
    .setVisible(false)
    .setDepth(5000)
    .setOrigin(0.5, 1);

  let activeChair: ChairArea | null = null;
  let seatedChair: ChairArea | null = null;
  let seatedDirection: Direction = 'down';

  function updatePrompt(label: string): void {
    prompt.setText(label);
    prompt.setPosition(player.sprite.x, player.sprite.y - 42);
    prompt.setVisible(true);
  }

  function hidePrompt(): void {
    prompt.setVisible(false);
  }

  function sitOnChair(chair: ChairArea): void {
    const playerPos = player.getPosition();
    const direction = chair.sitDirection || resolveSitDirection(playerPos.x, playerPos.y, chair);
    const sitPosition =
      chair.sitX !== undefined && chair.sitY !== undefined
        ? { x: chair.sitX, y: chair.sitY }
        : resolveSitPosition(chair, direction);

    seatedChair = chair;
    seatedDirection = direction;

    player.setPosition(sitPosition.x, sitPosition.y);
    player.setSitting(direction);
  }

  function leaveChair(): void {
    if (!seatedChair) {
      return;
    }

    const currentPos = player.getPosition();
    const leavePosition = resolveLeavePosition(currentPos.x, currentPos.y, seatedDirection);

    player.setStanding(seatedDirection);
    player.setPosition(leavePosition.x, leavePosition.y);

    seatedChair = null;
  }

  function findNearestChair(): ChairArea | null {
    const playerPos = player.getPosition();
    let nearest: ChairArea | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    chairs.forEach((chair) => {
      const distance = distanceToChair(playerPos.x, playerPos.y, chair);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = chair;
      }
    });

    if (!nearest || nearestDistance > INTERACTION_DISTANCE) {
      return null;
    }

    return nearest;
  }

  function update(): void {
    if (!player?.sprite?.active) {
      hidePrompt();
      return;
    }

    if (scene?.chatInputActive) {
      hidePrompt();
      return;
    }

    if (player.isSitting) {
      updatePrompt('Press E to leave');
      if (Phaser.Input.Keyboard.JustDown(interactKey)) {
        leaveChair();
      }
      return;
    }

    activeChair = findNearestChair();
    if (!activeChair) {
      hidePrompt();
      return;
    }

    updatePrompt('Press E to sit');
    if (Phaser.Input.Keyboard.JustDown(interactKey)) {
      sitOnChair(activeChair);
    }
  }

  function destroy(): void {
    prompt.destroy();
  }

  return { update, destroy };
}