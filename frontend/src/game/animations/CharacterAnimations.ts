import Phaser from 'phaser';

const CHARACTER_KEYS = ['adam', 'ash', 'lucy', 'nancy'] as const;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createNamedSequence(prefix: string, start: number, end: number): string[] {
  const frames: string[] = [];
  for (let i = start; i <= end; i += 1) {
    frames.push(`${prefix}${i}.png`);
  }
  return frames;
}

export function createCharacterAnims(anims: Phaser.Animations.AnimationManager): void {
  CHARACTER_KEYS.forEach((charKey) => {
    const charName = capitalize(charKey);

    const idleAnims = [
      {
        key: `${charKey}_idle_right`,
        frames: createNamedSequence(`${charName}_idle_anim_`, 1, 6),
      },
      {
        key: `${charKey}_idle_up`,
        frames: createNamedSequence(`${charName}_idle_anim_`, 7, 12),
      },
      {
        key: `${charKey}_idle_left`,
        frames: createNamedSequence(`${charName}_idle_anim_`, 13, 18),
      },
      {
        key: `${charKey}_idle_down`,
        frames: createNamedSequence(`${charName}_idle_anim_`, 19, 24),
      },
    ];

    idleAnims.forEach((animConfig) => {
      if (anims.exists(animConfig.key)) return;

      anims.create({
        key: animConfig.key,
        frames: anims.generateFrameNames(charKey, { frames: animConfig.frames }),
        frameRate: 15 * 0.6,
        repeat: -1,
      });
    });

    const runAnims = [
      {
        key: `${charKey}_run_right`,
        frames: createNamedSequence(`${charName}_run_`, 1, 6),
      },
      {
        key: `${charKey}_run_up`,
        frames: createNamedSequence(`${charName}_run_`, 7, 12),
      },
      {
        key: `${charKey}_run_left`,
        frames: createNamedSequence(`${charName}_run_`, 13, 18),
      },
      {
        key: `${charKey}_run_down`,
        frames: createNamedSequence(`${charName}_run_`, 19, 24),
      },
    ];

    runAnims.forEach((animConfig) => {
      if (anims.exists(animConfig.key)) return;

      anims.create({
        key: animConfig.key,
        frames: anims.generateFrameNames(charKey, { frames: animConfig.frames }),
        frameRate: 15,
        repeat: -1,
      });
    });

    const sitAnims = [
      { key: `${charKey}_sit_down`, frame: `${charName}_sit_down.png` },
      { key: `${charKey}_sit_left`, frame: `${charName}_sit_left.png` },
      { key: `${charKey}_sit_right`, frame: `${charName}_sit_right.png` },
      { key: `${charKey}_sit_up`, frame: `${charName}_sit_up.png` },
    ];

    sitAnims.forEach((animConfig) => {
      if (anims.exists(animConfig.key)) return;

      anims.create({
        key: animConfig.key,
        frames: anims.generateFrameNames(charKey, { frames: [animConfig.frame] }),
        frameRate: 15,
        repeat: 0,
      });
    });
  });
}