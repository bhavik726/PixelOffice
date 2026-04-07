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
    
    // Setup camera follow with a tight lock so POV moves directly with the character.
    this.cameraLerp = 1;
    this.cameraZoomDesktop = 2.1;
    this.cameraZoomMobile = 1.7;
    this.configureCamera();

    this.boundResizeHandler = () => {
      this.applyCameraZoom();
    };
    this.scene.scale.on('resize', this.boundResizeHandler);
    
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
    if (this.isMovementLocked || this.scene.chatInputActive || this.scene.whiteboardActive) {
      this.sprite.body.setVelocity(0, 0);
      this.isMoving = false;
      return;
    }

    // Reset velocity
    this.velocityX = 0;
    this.velocityY = 0;

    // Resolve key states first so we can control movement and animation priority explicitly.
    const leftDown = this.keys.left.isDown || this.keys.a.isDown;
    const rightDown = this.keys.right.isDown || this.keys.d.isDown;
    const upDown = this.keys.up.isDown || this.keys.w.isDown;
    const downDown = this.keys.down.isDown || this.keys.s.isDown;

    if (leftDown && !rightDown) {
      this.velocityX = -this.speed;
    } else if (rightDown && !leftDown) {
      this.velocityX = this.speed;
    }

    if (upDown && !downDown) {
      this.velocityY = -this.speed;
    } else if (downDown && !upDown) {
      this.velocityY = this.speed;
    }

    // Keep diagonal speed equal to cardinal speed.
    if (this.velocityX !== 0 && this.velocityY !== 0) {
      const diagonal = this.speed / Math.sqrt(2);
      this.velocityX = this.velocityX > 0 ? diagonal : -diagonal;
      this.velocityY = this.velocityY > 0 ? diagonal : -diagonal;
    }

    if (this.velocityX === 0 && this.velocityY === 0) {
      this.sprite.anims.play(
        `${this.characterKey}_idle_${this.currentDirection}`,
        true,
      );
      this.isMoving = false;
    } else {
      // Horizontal animation takes precedence for diagonal movement.
      if (this.velocityX < 0) {
        this.currentDirection = 'left';
      } else if (this.velocityX > 0) {
        this.currentDirection = 'right';
      } else if (this.velocityY < 0) {
        this.currentDirection = 'up';
      } else if (this.velocityY > 0) {
        this.currentDirection = 'down';
      }

      this.sprite.anims.play(`${this.characterKey}_run_${this.currentDirection}`, true);
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

  configureCamera() {
    const camera = this.scene.cameras.main;
    camera.setBounds(0, 0, this.scene.tilemap.widthInPixels, this.scene.tilemap.heightInPixels);
    camera.setRoundPixels(true);
    camera.startFollow(this.sprite, true, this.cameraLerp, this.cameraLerp);
    this.applyCameraZoom();
  }

  applyCameraZoom() {
    const camera = this.scene.cameras.main;
    const screenWidth = Number(window.innerWidth || this.scene.scale.width || 0);
    const zoom = screenWidth <= 768 ? this.cameraZoomMobile : this.cameraZoomDesktop;
    camera.setZoom(zoom);
  }
  
  destroy() {
    if (this.boundResizeHandler) {
      this.scene.scale.off('resize', this.boundResizeHandler);
      this.boundResizeHandler = null;
    }

    this.sprite.destroy();
  }
}
