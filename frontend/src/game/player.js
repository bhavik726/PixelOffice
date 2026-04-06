import Phaser from 'phaser';

/**
 * Player Controller
 * Manages player creation, movement, and camera following
 */

export default class Player {
  constructor(scene, x, y, characterKey = 'adam') {
    this.scene = scene;

    this.characterKey = characterKey;
    this.currentDirection = 'down';

    this.sprite = scene.physics.add.sprite(x, y, this.characterKey);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(1000);
    this.sprite.anims.play(`${this.characterKey}_idle_down`);
    this.sprite.body.setCollideWorldBounds(true);
    this.sprite.body.setBounce(0);
    // Narrow hitbox for top-down movement so feet align with map tiles.
    this.sprite.body.setSize(16, 20);
    this.sprite.body.setOffset(
      (this.sprite.width - 16) / 2,
      this.sprite.height - 20,
    );
    
    // Store references for easy access
    this.sprite.isPlayer = true;
    
    // Velocity for smooth movement
    this.velocityX = 0;
    this.velocityY = 0;
    this.speed = 200;
    this.isSitting = false;
    this.isMovementLocked = false;
    this.isMoving = false;
    
    // Setup camera follow
    scene.cameras.main.startFollow(this.sprite, true);
    scene.cameras.main.setBounds(0, 0, scene.tilemap.widthInPixels, scene.tilemap.heightInPixels);
    
    // Setup input keys for movement
    this.setupInput();
  }
  
  setupInput() {
    this.keys = this.scene.input.keyboard.createCursorKeys();
    this.keys.w = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keys.a = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keys.s = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keys.d = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }
  
  update() {
    if (this.isMovementLocked || this.scene.chatInputActive) {
      this.sprite.body.setVelocity(0, 0);
      this.isMoving = false;
      return;
    }

    // Reset velocity
    this.velocityX = 0;
    this.velocityY = 0;
    
    // Handle arrow keys and WASD
    if (this.keys.left.isDown || this.keys.a.isDown) {
      this.velocityX = -this.speed;
      this.currentDirection = 'left';
      this.sprite.anims.play(`${this.characterKey}_run_left`, true);
    }
    if (this.keys.right.isDown || this.keys.d.isDown) {
      this.velocityX = this.speed;
      this.currentDirection = 'right';
      this.sprite.anims.play(`${this.characterKey}_run_right`, true);
    }
    if (this.keys.up.isDown || this.keys.w.isDown) {
      this.velocityY = -this.speed;
      this.currentDirection = 'up';
      this.sprite.anims.play(`${this.characterKey}_run_up`, true);
    }
    if (this.keys.down.isDown || this.keys.s.isDown) {
      this.velocityY = this.speed;
      this.currentDirection = 'down';
      this.sprite.anims.play(`${this.characterKey}_run_down`, true);
    }

    if (this.velocityX === 0 && this.velocityY === 0) {
      this.sprite.anims.play(
        `${this.characterKey}_idle_${this.currentDirection}`,
        true,
      );
      this.isMoving = false;
    } else {
      this.isMoving = true;
    }
    
    // Apply velocity to sprite
    this.sprite.body.setVelocity(this.velocityX, this.velocityY);
  }
  
  getPosition() {
    return {
      x: this.sprite.x,
      y: this.sprite.y,
    };
  }

  getSyncState() {
    return {
      x: this.sprite.x,
      y: this.sprite.y,
      direction: this.currentDirection,
      isMoving: this.isMoving,
      isSitting: this.isSitting,
    };
  }
  
  setPosition(x, y) {
    const nextX = Number(x);
    const nextY = Number(y);

    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return;
    }

    const mapWidth = this.scene.tilemap?.widthInPixels;
    const mapHeight = this.scene.tilemap?.heightInPixels;

    if (Number.isFinite(mapWidth) && Number.isFinite(mapHeight)) {
      this.sprite.setPosition(
        Phaser.Math.Clamp(nextX, 0, mapWidth),
        Phaser.Math.Clamp(nextY, 0, mapHeight),
      );
      return;
    }

    this.sprite.setPosition(nextX, nextY);
  }

  setSitting(direction) {
    this.isSitting = true;
    this.isMovementLocked = true;
    this.isMoving = false;
    this.currentDirection = direction;
    this.sprite.body.setVelocity(0, 0);
    this.sprite.anims.play(`${this.characterKey}_sit_${direction}`, true);
  }

  setMovementLocked(locked) {
    this.isMovementLocked = Boolean(locked);

    if (this.isMovementLocked) {
      this.sprite.body.setVelocity(0, 0);
      this.isMoving = false;
    }
  }

  setStanding(direction = this.currentDirection) {
    this.isSitting = false;
    this.isMovementLocked = false;
    this.isMoving = false;
    this.currentDirection = direction;
    this.sprite.body.setVelocity(0, 0);
    this.sprite.anims.play(`${this.characterKey}_idle_${direction}`, true);
  }

  setCharacterKey(characterKey) {
    if (typeof characterKey !== 'string' || characterKey.length === 0) {
      return;
    }

    if (this.characterKey === characterKey) {
      return;
    }

    this.characterKey = characterKey;
    this.sprite.setTexture(characterKey);

    const activeAnim = this.isSitting
      ? `${this.characterKey}_sit_${this.currentDirection}`
      : `${this.characterKey}_idle_${this.currentDirection}`;
    this.sprite.anims.play(activeAnim, true);
  }
  
  destroy() {
    this.sprite.destroy();
  }
}
